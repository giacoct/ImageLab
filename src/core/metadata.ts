/**
 * Metadata in JPEG, PNG and WebP files, read and removed without decoding the
 * image: a file is split into its blocks (JPEG segments, PNG and WebP chunks),
 * metadata blocks are summarized or dropped, and the blocks known to make the
 * image, its compressed data included, are copied byte for byte; anything
 * else (an unknown chunk, what follows a JPEG's end) counts as metadata. HEIC and AVIF
 * files are read too (their EXIF, see `exif.ts`), not stripped.
 */

import { isobmffExif } from "./exif";

/**
 * What the file embeds, in words: `Label: value` (e.g. `Camera: Apple
 * iPhone 15`, `Location: 45.46431° N, 9.19123° E`) or just a label (`XMP…`).
 * The orientation and the color profile aren't listed: they're kept.
 */
export interface Metadata {
  found: string[];
  /** EXIF orientation, 1–8 (1 = upright, also when absent). */
  orientation: number;
}

type Kind =
  "image" | "exif" | "xmp" | "iptc" | "comment" | "text" | "appended" | "other";

interface Block {
  kind: Kind;
  start: number;
  end: number;
  /** The EXIF payload (TIFF structure), for `exif` blocks. */
  exif?: Uint8Array;
}

interface Parsed {
  format: "jpeg" | "png" | "webp";
  /** Bytes before the first block (signature/header). */
  head: number;
  blocks: Block[];
}

const NONE: Metadata = { found: [], orientation: 1 };

export function readMetadata(bytes: Uint8Array): Metadata {
  const parsed = parse(bytes);
  if (parsed) return summarize(parsed.blocks);
  // HEIC, AVIF: their EXIF, whose orientation they don't follow (`irot` does).
  const exif = isobmffExif(bytes);
  return exif ? { found: readExif(exif).found, orientation: 1 } : NONE;
}

/** The file's EXIF payload (a TIFF structure), if it has one. */
export function exifOf(bytes: Uint8Array): Uint8Array | null {
  const parsed = parse(bytes);
  if (!parsed) return isobmffExif(bytes);
  return parsed.blocks.find((block) => block.exif)?.exif ?? null;
}

/**
 * The ICC color profile a JPEG, PNG or WebP embeds, if any; a PNG's is
 * compressed (zlib, `deflated`).
 */
export function profileOf(
  bytes: Uint8Array,
): { data: Uint8Array; deflated: boolean } | null {
  const parsed = parse(bytes);
  if (!parsed) return null;
  const at = (block: Block, offset: number, length: number) =>
    ascii(bytes, block.start + offset, length);
  if (parsed.format === "jpeg") {
    // APP2 segments: "ICC_PROFILE\0", its number, how many, then a part.
    const parts = parsed.blocks
      .filter(
        (block) =>
          block.kind === "image" &&
          bytes[block.start + 1] === 0xe2 &&
          at(block, 4, 12) === "ICC_PROFILE\0",
      )
      .sort((a, b) => bytes[a.start + 16] - bytes[b.start + 16])
      .map((block) => bytes.subarray(block.start + 18, block.end));
    if (parts.length === 0) return null;
    const data = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      data.set(part, offset);
      offset += part.length;
    }
    return { data, deflated: false };
  }
  for (const block of parsed.blocks) {
    if (parsed.format === "png" && at(block, 4, 4) === "iCCP") {
      // A name (up to 79 bytes, ended by 0), the compression method, the data.
      const end = block.end - 4; // before the CRC
      const name = bytes.subarray(block.start + 8, end).indexOf(0);
      if (name < 0) return null;
      return {
        data: bytes.subarray(block.start + 8 + name + 2, end),
        deflated: true,
      };
    }
    if (parsed.format === "webp" && at(block, 0, 4) === "ICCP") {
      const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(
        block.start + 4,
        true,
      );
      return {
        data: bytes.subarray(block.start + 8, block.start + 8 + size),
        deflated: false,
      };
    }
  }
  return null;
}

/** What an EXIF payload holds, in words (as `Metadata.found`). */
export function describeExif(tiff: Uint8Array): string[] {
  return readExif(tiff).found;
}

/**
 * The file without its metadata, or `null` when it can't be done losslessly
 * (another format, a malformed file, or a PNG/WebP turned by its EXIF
 * orientation, which would display differently without it). A JPEG keeps a
 * minimal EXIF block with just its orientation; color profiles always stay.
 */
export function stripMetadata(
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  const parsed = parse(bytes);
  if (!parsed) return null;
  const { orientation } = summarize(parsed.blocks);
  if (parsed.format !== "jpeg" && orientation !== 1) return null;

  const kept = parsed.blocks.filter((block) => block.kind === "image");
  const parts = [bytes.subarray(0, parsed.head)];
  for (const block of kept) {
    let part = bytes.subarray(block.start, block.end);
    if (parsed.format === "webp" && ascii(part, 0, 4) === "VP8X") {
      part = part.slice();
      part[8] &= ~0x0c; // clear the "has EXIF" and "has XMP" flags
    }
    parts.push(part);
  }
  if (parsed.format === "jpeg" && orientation !== 1) {
    // JFIF (APP0) must stay first; the orientation goes right after it.
    const jfif = kept[0] && bytes[kept[0].start + 1] === 0xe0;
    parts.splice(jfif ? 2 : 1, 0, orientationSegment(orientation));
  }

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  if (parsed.format === "webp")
    new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

// --- parsing ---------------------------------------------------------------------

function parse(bytes: Uint8Array): Parsed | null {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8)
      return { format: "jpeg", head: 2, blocks: jpeg(bytes) };
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") {
      return { format: "png", head: 8, blocks: png(bytes) };
    }
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
      return { format: "webp", head: 12, blocks: webp(bytes) };
    }
  } catch {
    // Malformed: treated as a format we don't handle.
  }
  return null;
}

/**
 * JPEG segments, scans included, up to the end of the image (EOI). Whatever
 * follows it is one `appended` block: phones put more images there (an HDR
 * gain map, a depth map, each with its own EXIF) or a Motion Photo's video.
 */
function jpeg(bytes: Uint8Array): Block[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks: Block[] = [];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Bad JPEG marker");
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      blocks.push({ kind: "image", start: offset, end: offset + 2 });
      offset += 2;
      break;
    }
    let end = offset + 2 + view.getUint16(offset + 2);
    if (end > bytes.length) throw new Error("Truncated JPEG");
    const id = ascii(bytes, offset + 4, 12);
    let kind: Kind = "image";
    if (marker === 0xda) end = scanEnd(bytes, end);
    else if (marker === 0xe1 && id.startsWith("Exif\0\0")) kind = "exif";
    else if (marker === 0xe1) kind = "xmp";
    else if (marker === 0xed) kind = "iptc";
    else if (marker === 0xfe) kind = "comment";
    else if (marker >= 0xe0 && marker <= 0xef) {
      // Other APPn blocks are metadata, except those needed to show the image.
      const needed =
        (marker === 0xe0 && /^JF(IF|XX)/.test(id)) ||
        (marker === 0xe2 && id.startsWith("ICC_PROFILE")) ||
        (marker === 0xee && id.startsWith("Adobe"));
      if (!needed) kind = "other";
    }
    const block: Block = { kind, start: offset, end };
    if (kind === "exif") block.exif = bytes.subarray(offset + 10, end);
    blocks.push(block);
    offset = end;
  }
  if (offset < bytes.length)
    blocks.push({ kind: "appended", start: offset, end: bytes.length });
  return blocks;
}

/**
 * Where a scan's compressed data ends: at the next marker. In the data, 0xFF
 * is followed by 0 (an escaped 0xFF) or a restart marker (RST0–7).
 */
function scanEnd(bytes: Uint8Array, from: number): number {
  for (let at = from; at + 1 < bytes.length; at++) {
    if (bytes[at] !== 0xff) continue;
    const next = bytes[at + 1];
    if (next !== 0 && next !== 0xff && (next < 0xd0 || next > 0xd7)) return at;
  }
  return bytes.length; // truncated: the data runs to the end
}

/**
 * The PNG chunks that make the image and how it shows (its colors, its
 * transparency, its animation); any other is metadata, so stripping keeps
 * only what's known to be harmless (C2PA's `caBX`, say, goes).
 */
const PNG_IMAGE = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "cICP",
  "mDCV",
  "cLLI",
  "sBIT",
  "bKGD",
  "pHYs",
  "acTL",
  "fcTL",
  "fdAT",
]);

function png(bytes: Uint8Array): Block[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks: Block[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const size = view.getUint32(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) throw new Error("Truncated PNG");
    const type = ascii(bytes, offset + 4, 4);
    let kind: Kind = "image";
    if (type === "eXIf") kind = "exif";
    else if (
      type === "iTXt" &&
      ascii(bytes, offset + 8, 17) === "XML:com.adobe.xmp"
    )
      kind = "xmp";
    else if (type === "tEXt" || type === "zTXt" || type === "iTXt")
      kind = "text";
    else if (!PNG_IMAGE.has(type)) kind = "other";
    const block: Block = { kind, start: offset, end };
    if (kind === "exif")
      block.exif = bytes.subarray(offset + 8, offset + 8 + size);
    blocks.push(block);
    offset = end;
    if (type === "IEND") break;
  }
  return blocks;
}

/** The WebP chunks that make the image (as `PNG_IMAGE`). */
const WEBP_IMAGE = new Set([
  "VP8X",
  "VP8 ",
  "VP8L",
  "ALPH",
  "ANIM",
  "ANMF",
  "ICCP",
]);

function webp(bytes: Uint8Array): Block[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks: Block[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    const end = Math.min(bytes.length, offset + 8 + size + (size % 2)); // padded to even sizes
    const type = ascii(bytes, offset, 4);
    const kind: Kind =
      type === "EXIF"
        ? "exif"
        : type === "XMP "
          ? "xmp"
          : WEBP_IMAGE.has(type)
            ? "image"
            : "other";
    const block: Block = { kind, start: offset, end };
    if (kind === "exif") {
      const payload = bytes.subarray(offset + 8, offset + 8 + size);
      // Some writers keep the JPEG-style "Exif\0\0" prefix.
      block.exif =
        ascii(payload, 0, 6) === "Exif\0\0" ? payload.subarray(6) : payload;
    }
    blocks.push(block);
    offset = end;
  }
  return blocks;
}

// --- summary -----------------------------------------------------------------------

const DESCRIPTIONS: Partial<Record<Kind, string>> = {
  xmp: "XMP (editing history, ratings…)",
  iptc: "IPTC (captions, keywords…)",
  comment: "Comment",
  text: "Text notes",
  appended: "More images or a video after the photo",
  other: "Other metadata",
};

function summarize(blocks: readonly Block[]): Metadata {
  const found: string[] = [];
  let orientation = 1;
  for (const block of blocks) {
    if (block.exif) {
      const exif = readExif(block.exif);
      found.push(...exif.found);
      orientation = exif.orientation;
    }
    const description = DESCRIPTIONS[block.kind];
    if (description && !found.includes(description)) found.push(description);
  }
  return { found, orientation };
}

const TAG = {
  description: 0x010e,
  make: 0x010f,
  model: 0x0110,
  orientation: 0x0112,
  software: 0x0131,
  dateTime: 0x0132,
  artist: 0x013b,
  copyright: 0x8298,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  dateTimeOriginal: 0x9003,
  serialNumber: 0xa431,
  lensModel: 0xa434,
  latitudeRef: 0x0001,
  latitude: 0x0002,
  longitudeRef: 0x0003,
  longitude: 0x0004,
};

/** IFD0 tags about the image's layout, not about who, where or how: not worth listing. */
const LAYOUT_TAGS = new Set([
  TAG.orientation,
  TAG.exifIfd,
  TAG.gpsIfd,
  0x011a, // XResolution
  0x011b, // YResolution
  0x0128, // ResolutionUnit
  0x0213, // YCbCrPositioning
]);

/** EXIF IFD tags about the file's format, not the photo: not worth listing either. */
const FORMAT_TAGS = new Set([
  0x9000, // ExifVersion
  0x9101, // ComponentsConfiguration
  0xa000, // FlashpixVersion
  0xa001, // ColorSpace
  0xa002, // PixelXDimension
  0xa003, // PixelYDimension
]);

type TagValue = string | number | number[] | true;

/** `2026:08:14 18:42:07` → `2026-08-14 18:42`. */
function formatDate(date: string): string {
  const match = /^(\d{4}):(\d\d):(\d\d) (\d\d:\d\d)/.exec(date);
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}` : date;
}

/** Degrees, minutes, seconds and N/S/E/W → `45.46431° N`, or null. */
function coordinate(value: TagValue | undefined, ref: TagValue | undefined) {
  if (!Array.isArray(value) || value.length !== 3 || typeof ref !== "string")
    return null;
  const [d, m, s] = value;
  const degrees = d + m / 60 + s / 3600;
  return Number.isFinite(degrees) ? `${degrees.toFixed(5)}° ${ref}` : null;
}

/** The interesting parts of an EXIF (TIFF) payload. */
function readExif(tiff: Uint8Array): Metadata {
  try {
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const little = view.getUint16(0) === 0x4949;
    const ifd0 = readIfd(tiff, view, view.getUint32(4, little), little);
    const exifAt = ifd0.get(TAG.exifIfd);
    const exif =
      typeof exifAt === "number"
        ? readIfd(tiff, view, exifAt, little)
        : new Map();
    const gpsAt = ifd0.get(TAG.gpsIfd);
    const gps =
      typeof gpsAt === "number"
        ? readIfd(tiff, view, gpsAt, little)
        : new Map();

    const text = (value: unknown) =>
      typeof value === "string" && value ? value : undefined;
    const found: string[] = [];
    const add = (label: string, value: string | undefined) => {
      if (value) found.push(`${label}: ${value}`);
    };
    // The model often repeats the make ("Canon" + "Canon EOS R6").
    const make = text(ifd0.get(TAG.make));
    const model = text(ifd0.get(TAG.model));
    add(
      "Camera",
      make && model?.startsWith(make)
        ? model
        : [make, model].filter(Boolean).join(" "),
    );
    add("Lens", text(exif.get(TAG.lensModel)));
    add("Serial number", text(exif.get(TAG.serialNumber)));
    const date =
      text(exif.get(TAG.dateTimeOriginal)) ?? text(ifd0.get(TAG.dateTime));
    add("Taken", date && formatDate(date));
    const latitude = coordinate(
      gps.get(TAG.latitude),
      gps.get(TAG.latitudeRef),
    );
    const longitude = coordinate(
      gps.get(TAG.longitude),
      gps.get(TAG.longitudeRef),
    );
    if (latitude && longitude) add("Location", `${latitude}, ${longitude}`);
    else if (gps.size > 0) found.push("GPS location");
    add("Author", text(ifd0.get(TAG.artist)));
    add("Copyright", text(ifd0.get(TAG.copyright)));
    add("Description", text(ifd0.get(TAG.description)));
    add("Software", text(ifd0.get(TAG.software)));
    // Exposure, settings and the like: listed once, together. An EXIF block
    // with only the orientation (what stripping keeps) isn't listed at all.
    const listed = new Set<number>([
      TAG.make,
      TAG.model,
      TAG.dateTime,
      TAG.artist,
      TAG.copyright,
      TAG.description,
      TAG.software,
    ]);
    const more =
      [...ifd0.keys()].some(
        (tag) => !LAYOUT_TAGS.has(tag) && !listed.has(tag),
      ) ||
      [...exif.keys()].some(
        (tag) =>
          !FORMAT_TAGS.has(tag) &&
          tag !== TAG.dateTimeOriginal &&
          tag !== TAG.lensModel &&
          tag !== TAG.serialNumber,
      );
    if (more) found.push("Camera settings (exposure, flash…)");

    const raw = ifd0.get(TAG.orientation);
    const orientation =
      typeof raw === "number" && raw >= 1 && raw <= 8 ? raw : 1;
    return { found, orientation };
  } catch {
    return { found: ["Camera details (EXIF)"], orientation: 1 };
  }
}

/**
 * An IFD's tags: ASCII as text, single SHORT/LONG as numbers, RATIONALs as
 * a list of numbers, anything else as `true`.
 */
function readIfd(
  tiff: Uint8Array,
  view: DataView,
  offset: number,
  little: boolean,
): Map<number, TagValue> {
  const tags = new Map<number, TagValue>();
  const count = view.getUint16(offset, little);
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);
    if (type === 2) {
      const at = length <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
      tags.set(tag, ascii(tiff, at, length).replace(/\0+$/, "").trim());
    } else if (type === 3 && length === 1)
      tags.set(tag, view.getUint16(entry + 8, little));
    else if (type === 4 && length === 1)
      tags.set(tag, view.getUint32(entry + 8, little));
    else if (type === 5 && length <= 16) {
      const at = view.getUint32(entry + 8, little);
      tags.set(
        tag,
        Array.from(
          { length },
          (_, k) =>
            view.getUint32(at + k * 8, little) /
            view.getUint32(at + k * 8 + 4, little),
        ),
      );
    } else tags.set(tag, true);
  }
  return tags;
}

// --- helpers ---------------------------------------------------------------------

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/** An APP1 EXIF segment holding only the orientation. */
function orientationSegment(orientation: number): Uint8Array {
  const segment = new Uint8Array(36);
  const view = new DataView(segment.buffer);
  view.setUint16(0, 0xffe1);
  view.setUint16(2, 34); // length, without the marker
  segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  segment.set([0x4d, 0x4d, 0, 0x2a], 10); // big-endian TIFF header
  view.setUint32(14, 8); // first IFD
  view.setUint16(18, 1); // one entry
  view.setUint16(20, TAG.orientation);
  view.setUint16(22, 3); // SHORT
  view.setUint32(24, 1); // count
  view.setUint16(28, orientation);
  view.setUint32(32, 0); // no next IFD
  return segment;
}
