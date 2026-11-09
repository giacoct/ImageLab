/**
 * Metadata in JPEG, PNG and WebP files, read and removed without decoding the
 * image: a file is split into its blocks (JPEG segments, PNG and WebP chunks),
 * metadata blocks are summarized or dropped, and everything else, the
 * compressed image data included, is copied byte for byte.
 */

/** What the file embeds, in words, e.g. `Camera: Apple iPhone 15`, `GPS location`. */
export interface Metadata {
  found: string[];
  /** EXIF orientation, 1–8 (1 = upright, also when absent). */
  orientation: number;
}

type Kind = "image" | "exif" | "xmp" | "iptc" | "comment" | "text" | "other";

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
  return parsed ? summarize(parsed.blocks) : NONE;
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

/** JPEG segments up to the image data, which is one last `image` block. */
function jpeg(bytes: Uint8Array): Block[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks: Block[] = [];
  let offset = 2;
  for (;;) {
    if (bytes[offset] !== 0xff) throw new Error("Bad JPEG marker");
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xda) break; // start of scan: the image data follows
    const end = offset + 2 + view.getUint16(offset + 2);
    if (end > bytes.length) throw new Error("Truncated JPEG");
    const id = ascii(bytes, offset + 4, 12);
    let kind: Kind = "image";
    if (marker === 0xe1 && id.startsWith("Exif\0\0")) kind = "exif";
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
  blocks.push({ kind: "image", start: offset, end: bytes.length });
  return blocks;
}

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
    else if (type === "tIME") kind = "other";
    const block: Block = { kind, start: offset, end };
    if (kind === "exif")
      block.exif = bytes.subarray(offset + 8, offset + 8 + size);
    blocks.push(block);
    offset = end;
    if (type === "IEND") break;
  }
  return blocks;
}

function webp(bytes: Uint8Array): Block[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks: Block[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    const end = Math.min(bytes.length, offset + 8 + size + (size % 2)); // padded to even sizes
    const type = ascii(bytes, offset, 4);
    const kind: Kind =
      type === "EXIF" ? "exif" : type === "XMP " ? "xmp" : "image";
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
  make: 0x010f,
  model: 0x0110,
  orientation: 0x0112,
  software: 0x0131,
  dateTime: 0x0132,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  dateTimeOriginal: 0x9003,
};

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
    const camera = [text(ifd0.get(TAG.make)), text(ifd0.get(TAG.model))]
      .filter(Boolean)
      .join(" ");
    if (camera) found.push(`Camera: ${camera}`);
    const date =
      text(exif.get(TAG.dateTimeOriginal)) ?? text(ifd0.get(TAG.dateTime));
    if (date) found.push(`Date: ${date}`);
    const software = text(ifd0.get(TAG.software));
    if (software) found.push(`Software: ${software}`);
    if (gps.size > 0) found.push("GPS location");
    if (found.length === 0) found.push("EXIF data");

    const raw = ifd0.get(TAG.orientation);
    const orientation =
      typeof raw === "number" && raw >= 1 && raw <= 8 ? raw : 1;
    return { found, orientation };
  } catch {
    return { found: ["EXIF data"], orientation: 1 };
  }
}

/** An IFD's tags: ASCII as text, single SHORT/LONG as numbers, anything else as `true`. */
function readIfd(
  tiff: Uint8Array,
  view: DataView,
  offset: number,
  little: boolean,
): Map<number, string | number | true> {
  const tags = new Map<number, string | number | true>();
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
    else tags.set(tag, true);
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
