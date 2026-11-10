/**
 * A photo's EXIF (camera, date, location, exposure…) carried into the files
 * the app writes, so a tool doesn't lose them; Strip metadata removes them.
 *
 * What's carried is a clean copy (`carriedExif`): rebuilt from the input's
 * tags, without what would be wrong or would leak the image as it was
 * before the tool: the embedded thumbnail and maker notes (which can hold a
 * preview), the orientation (the pixels are upright now), the dimensions
 * and the color space. `embed.ts` puts it in a JPEG, PNG or WebP.
 *
 * HEIC and AVIF keep their EXIF in an `Exif` item (`isobmffExif`); the app
 * reads it, but doesn't write it into the AVIF files it makes.
 */

import { itemOfType } from "./isobmff";

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

// --- HEIC and AVIF -----------------------------------------------------------------

/** The EXIF payload (TIFF) of a HEIC or AVIF file: its `Exif` item, or null. */
export function isobmffExif(bytes: Uint8Array): Uint8Array | null {
  const item = itemOfType(bytes, "Exif");
  if (!item || item.length < 4) return null;
  // The item starts with the offset to the TIFF header after it (past an
  // "Exif\0\0" most writers add).
  const skip =
    4 +
    new DataView(item.buffer, item.byteOffset, item.byteLength).getUint32(0);
  return skip < item.length ? item.subarray(skip) : null;
}
