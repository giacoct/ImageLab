/**
 * A photo's EXIF (camera, date, location, exposure…) carried into the files
 * the app writes, so a tool doesn't lose them; Strip metadata removes them.
 *
 * What's carried is a clean copy (`carriedExif`): rebuilt from the input's
 * tags, without what would be wrong or would leak the image as it was
 * before the tool: the embedded thumbnail and maker notes (which can hold a
 * preview), the orientation (the pixels are upright now), the dimensions
 * and the color space. `embedExif` puts it in a JPEG, PNG or WebP.
 *
 * HEIC and AVIF keep their EXIF in an `Exif` item (`isobmffExif`); the app
 * reads it, but doesn't write it into the AVIF files it makes.
 */

import { crc32 } from "./zip";

/** Bytes per value of each TIFF type (1 BYTE … 12 DOUBLE). */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];

const EXIF_IFD = 0x8769;
const GPS_IFD = 0x8825;

/** IFD0 tags left behind: the image's layout and data, and pointers elsewhere. */
const DROPPED_IFD0 = new Set([
  0x0100, // ImageWidth
  0x0101, // ImageLength
  0x0102, // BitsPerSample
  0x0103, // Compression
  0x0106, // PhotometricInterpretation
  0x0111, // StripOffsets
  0x0112, // Orientation
  0x0115, // SamplesPerPixel
  0x0116, // RowsPerStrip
  0x0117, // StripByteCounts
  0x011c, // PlanarConfiguration
  0x0144, // TileOffsets
  0x0145, // TileByteCounts
  0x014a, // SubIFDs
  0x0201, // JPEGInterchangeFormat (thumbnail)
  0x0202, // JPEGInterchangeFormatLength
  0x02bc, // XMP
  0x8773, // ICC profile
  EXIF_IFD,
  GPS_IFD,
]);

/** EXIF IFD tags left behind. */
const DROPPED_EXIF = new Set([
  0x927c, // MakerNote: the maker's own data, previews included
  0xa001, // ColorSpace: the file's color profile says it
  0xa002, // PixelXDimension
  0xa003, // PixelYDimension
  0xa005, // Interoperability IFD
]);

/** A tag's value longer than this is left behind (a carried EXIF stays small). */
const MAX_VALUE = 8 * 1024;

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** The value's bytes, in the TIFF's byte order. */
  value: Uint8Array;
}

/**
 * The EXIF to carry into files made from a photo with this EXIF payload (a
 * TIFF structure), or null if there's nothing to carry.
 */
export function carriedExif(tiff: Uint8Array | null): Uint8Array | null {
  if (!tiff) return null;
  try {
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const order = view.getUint16(0);
    if (order !== 0x4949 && order !== 0x4d4d) return null;
    const little = order === 0x4949;
    if (view.getUint16(2, little) !== 42) return null;
    const ifd0 = readIfd(tiff, view, view.getUint32(4, little), little);
    const at = (tag: number) => {
      const entry = ifd0.find((candidate) => candidate.tag === tag);
      return entry && (entry.type === 4 || entry.type === 13)
        ? new DataView(entry.value.buffer, entry.value.byteOffset).getUint32(
            0,
            little,
          )
        : null;
    };
    const exifAt = at(EXIF_IFD);
    const gpsAt = at(GPS_IFD);
    const main = ifd0.filter((entry) => !DROPPED_IFD0.has(entry.tag));
    const exif =
      exifAt === null
        ? []
        : readIfd(tiff, view, exifAt, little).filter(
            (entry) => !DROPPED_EXIF.has(entry.tag),
          );
    const gps = gpsAt === null ? [] : readIfd(tiff, view, gpsAt, little);
    if (main.length + exif.length + gps.length === 0) return null;
    return writeTiff(little, main, exif, gps);
  } catch {
    return null; // malformed: nothing carried
  }
}

/** An IFD's entries with their values, skipping the ones that can't be copied. */
function readIfd(
  tiff: Uint8Array,
  view: DataView,
  offset: number,
  little: boolean,
): Entry[] {
  const entries: Entry[] = [];
  const count = view.getUint16(offset, little);
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    const tag = view.getUint16(at, little);
    const type = view.getUint16(at + 2, little);
    const length = view.getUint32(at + 4, little);
    const size = (TYPE_SIZE[type] ?? 0) * length;
    if (size === 0 || size > MAX_VALUE) continue;
    const from = size <= 4 ? at + 8 : view.getUint32(at + 8, little);
    if (from + size > tiff.length) continue;
    entries.push({
      tag,
      type,
      count: length,
      value: tiff.slice(from, from + size),
    });
  }
  return entries;
}

/** A TIFF holding IFD0, which points to the EXIF and GPS IFDs when they have tags. */
function writeTiff(
  little: boolean,
  main: Entry[],
  exif: Entry[],
  gps: Entry[],
): Uint8Array {
  const pointer = (tag: number): Entry => ({
    tag,
    type: 4,
    count: 1,
    value: new Uint8Array(4),
  });
  const ifds = [
    [
      ...main,
      ...(exif.length ? [pointer(EXIF_IFD)] : []),
      ...(gps.length ? [pointer(GPS_IFD)] : []),
    ],
    exif,
    gps,
  ]
    .filter((ifd, index) => index === 0 || ifd.length)
    // Tags in ascending order, as TIFF requires.
    .map((ifd) => ifd.toSorted((a, b) => a.tag - b.tag));

  // Layout: header, the IFDs, then the values too long to sit in an entry.
  const starts: number[] = [];
  let size = 8;
  for (const ifd of ifds) {
    starts.push(size);
    size += 2 + ifd.length * 12 + 4;
  }
  const valuesAt = size;
  for (const ifd of ifds)
    for (const entry of ifd)
      if (entry.value.length > 4) size += entry.value.length + (size % 2);

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint16(0, little ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  // The EXIF and GPS IFDs follow IFD0, in that order, when present.
  const pointed: Record<number, number> = {};
  let next = 1;
  if (exif.length) pointed[EXIF_IFD] = starts[next++];
  if (gps.length) pointed[GPS_IFD] = starts[next++];

  let data = valuesAt;
  ifds.forEach((ifd, index) => {
    let at = starts[index];
    view.setUint16(at, ifd.length, little);
    at += 2;
    for (const entry of ifd) {
      view.setUint16(at, entry.tag, little);
      view.setUint16(at + 2, entry.type, little);
      view.setUint32(at + 4, entry.count, little);
      if (entry.tag in pointed && index === 0)
        view.setUint32(at + 8, pointed[entry.tag], little);
      else if (entry.value.length <= 4) out.set(entry.value, at + 8);
      else {
        data += data % 2; // values start on a word boundary
        view.setUint32(at + 8, data, little);
        out.set(entry.value, data);
        data += entry.value.length;
      }
      at += 12;
    }
    view.setUint32(at, 0, little); // no next IFD (no thumbnail)
  });
  return out;
}

// --- writing it into a file ------------------------------------------------------

/**
 * The file (a JPEG, PNG or WebP the app wrote) with this EXIF payload in it,
 * or null for another format or an EXIF too large for it.
 */
export function embedExif(
  file: Uint8Array,
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  const ascii = (from: number, length: number) =>
    String.fromCharCode(...file.subarray(from, from + length));
  if (file[0] === 0xff && file[1] === 0xd8) return jpegWith(file, tiff);
  if (file[0] === 0x89 && ascii(1, 3) === "PNG") return pngWith(file, tiff);
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    return webpWith(file, tiff);
  return null;
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"

/** An APP1 segment, after the JFIF segment if there's one (it must come first). */
function jpegWith(
  file: Uint8Array,
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  const length = 2 + EXIF_HEADER.length + tiff.length;
  if (length > 0xffff) return null;
  const segment = new Uint8Array(2 + length);
  segment.set([0xff, 0xe1, length >> 8, length & 255, ...EXIF_HEADER]);
  segment.set(tiff, 4 + EXIF_HEADER.length);
  let at = 2;
  if (file[2] === 0xff && file[3] === 0xe0) at = 4 + ((file[4] << 8) | file[5]);
  return concat(file.subarray(0, at), segment, file.subarray(at));
}

/** An `eXIf` chunk right after the header (IHDR), before the image data. */
function pngWith(file: Uint8Array, tiff: Uint8Array): Uint8Array<ArrayBuffer> {
  const chunk = new Uint8Array(12 + tiff.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, tiff.length);
  chunk.set([0x65, 0x58, 0x49, 0x66], 4); // "eXIf"
  chunk.set(tiff, 8);
  view.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)));
  const ihdrEnd =
    8 + 12 + new DataView(file.buffer, file.byteOffset).getUint32(8);
  return concat(file.subarray(0, ihdrEnd), chunk, file.subarray(ihdrEnd));
}

/**
 * An `EXIF` chunk at the end. That takes the extended format: a simple WebP
 * (one `VP8 ` or `VP8L` chunk) gets a `VP8X` header with its size and
 * whether it has alpha, read from the bitstream.
 */
function webpWith(
  file: Uint8Array,
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const first = String.fromCharCode(...file.subarray(12, 16));
  let head: Uint8Array;
  let body = file.subarray(12);
  if (first === "VP8X") {
    head = file.slice(12, 30);
    head[8] |= 0x08; // has EXIF
    body = file.subarray(30);
  } else {
    let width: number;
    let height: number;
    let alpha = false;
    if (first === "VP8L") {
      const bits = view.getUint32(21, true); // after the 0x2f signature
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      alpha = ((bits >>> 28) & 1) === 1;
    } else if (first === "VP8 ") {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else return null;
    head = new Uint8Array(18);
    head.set([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0]); // "VP8X", 10 bytes
    head[8] = 0x08 | (alpha ? 0x10 : 0);
    head.set(uint24(width - 1), 12);
    head.set(uint24(height - 1), 15);
  }
  const padded = tiff.length + (tiff.length % 2);
  const chunk = new Uint8Array(8 + padded);
  chunk.set([0x45, 0x58, 0x49, 0x46]); // "EXIF"
  new DataView(chunk.buffer).setUint32(4, tiff.length, true);
  chunk.set(tiff, 8);
  const out = concat(file.subarray(0, 12), head, body, chunk);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

function uint24(n: number): number[] {
  return [n & 255, (n >> 8) & 255, (n >> 16) & 255];
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// --- HEIC and AVIF -----------------------------------------------------------------

interface Box {
  type: string;
  /** Where its content starts (after the header) and where the box ends. */
  start: number;
  end: number;
}

/** The boxes between `from` and `to`. */
function boxes(view: DataView, from: number, to: number): Box[] {
  const found: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let start = at + 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      start += 8;
    } else if (size === 0) size = to - at; // to the end
    if (size < 8 || at + size > to) break;
    const type = String.fromCharCode(
      ...new Uint8Array(view.buffer, view.byteOffset + at + 4, 4),
    );
    found.push({ type, start, end: at + size });
    at += size;
  }
  return found;
}

/** An unsigned number of 0, 4 or 8 bytes. */
function readSized(view: DataView, at: number, size: number): number {
  if (size === 4) return view.getUint32(at);
  if (size === 8) return Number(view.getBigUint64(at));
  return 0;
}

/**
 * The EXIF payload (TIFF) of a HEIC or AVIF file: its `Exif` item, located
 * through the `meta` box (`iinf` names the items, `iloc` places them), or
 * null.
 */
export function isobmffExif(bytes: Uint8Array): Uint8Array | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const meta = boxes(view, 0, bytes.length).find(
      (box) => box.type === "meta",
    );
    if (!meta) return null;
    const children = boxes(view, meta.start + 4, meta.end); // after version/flags
    const iinf = children.find((box) => box.type === "iinf");
    const iloc = children.find((box) => box.type === "iloc");
    const idat = children.find((box) => box.type === "idat");
    if (!iinf || !iloc) return null;

    // The Exif item's id.
    const iinfVersion = view.getUint8(iinf.start);
    const infeFrom = iinf.start + 4 + (iinfVersion === 0 ? 2 : 4);
    let id: number | null = null;
    for (const infe of boxes(view, infeFrom, iinf.end)) {
      const version = view.getUint8(infe.start);
      if (infe.type !== "infe" || version < 2) continue;
      const itemId =
        version === 2
          ? view.getUint16(infe.start + 4)
          : view.getUint32(infe.start + 4);
      const typeAt = infe.start + 4 + (version === 2 ? 2 : 4) + 2;
      if (String.fromCharCode(...bytes.subarray(typeAt, typeAt + 4)) === "Exif")
        id = itemId;
    }
    if (id === null) return null;

    // Where its bytes are.
    const version = view.getUint8(iloc.start);
    let at = iloc.start + 4;
    const sizes = view.getUint8(at);
    const offsetSize = sizes >> 4;
    const lengthSize = sizes & 15;
    const sizes2 = view.getUint8(at + 1);
    const baseSize = sizes2 >> 4;
    const indexSize = version === 1 || version === 2 ? sizes2 & 15 : 0;
    at += 2;
    const count = version < 2 ? view.getUint16(at) : view.getUint32(at);
    at += version < 2 ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const itemId = version < 2 ? view.getUint16(at) : view.getUint32(at);
      at += version < 2 ? 2 : 4;
      let method = 0;
      if (version === 1 || version === 2) {
        method = view.getUint16(at) & 15;
        at += 2;
      }
      at += 2; // data reference index
      const base = readSized(view, at, baseSize);
      at += baseSize;
      const extents = view.getUint16(at);
      at += 2;
      const parts: Uint8Array[] = [];
      for (let e = 0; e < extents; e++) {
        at += indexSize;
        const offset = readSized(view, at, offsetSize);
        at += offsetSize;
        const length = readSized(view, at, lengthSize);
        at += lengthSize;
        const from = (method === 1 && idat ? idat.start : 0) + base + offset;
        parts.push(bytes.subarray(from, from + length));
      }
      if (itemId !== id) continue;
      // The item starts with the offset to the TIFF header after it
      // (past an "Exif\0\0" most writers add).
      const item = concat(...parts);
      const skip = 4 + new DataView(item.buffer).getUint32(0);
      return skip < item.length ? item.subarray(skip) : null;
    }
    return null;
  } catch {
    return null;
  }
}
