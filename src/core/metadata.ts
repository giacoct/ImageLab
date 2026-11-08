/**
 * Image metadata without decoding pixels: summarize what a file embeds (EXIF
 * camera/date/GPS, XMP, IPTC, comments, text chunks) and remove it losslessly
 * from JPEG, PNG and WebP files by dropping the metadata segments/chunks — the
 * compressed image data is copied byte for byte.
 */

export interface MetadataEntry {
  label: string;
  value: string;
}

export interface MetadataSummary {
  entries: MetadataEntry[];
  /** EXIF orientation (1 = upright, the default when absent). */
  orientation: number;
}

const EMPTY: MetadataSummary = { entries: [], orientation: 1 };

/** Summarize the metadata in a JPEG, PNG or WebP file; anything else or malformed → empty. */
export function inspectMetadata(bytes: Uint8Array, type: string): MetadataSummary {
  try {
    const blocks =
      type === 'image/jpeg'
        ? jpegBlocks(bytes)
        : type === 'image/png'
          ? pngBlocks(bytes)
          : type === 'image/webp'
            ? webpBlocks(bytes)
            : null;
    return blocks ? summarize(blocks) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * The file without its metadata, or `null` when this format (or this
 * particular file) can't be cleaned losslessly and must be re-encoded.
 * JPEG keeps a minimal EXIF block with just the orientation so the photo
 * still displays upright; the color profile is always kept.
 */
export function stripMetadata(bytes: Uint8Array, type: string): Uint8Array<ArrayBuffer> | null {
  try {
    switch (type) {
      case 'image/jpeg':
        return stripJpeg(bytes);
      case 'image/png':
        return stripPng(bytes);
      case 'image/webp':
        return stripWebp(bytes);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// --- shared --------------------------------------------------------------------

/** Metadata blocks found in a file, before interpretation. */
interface Blocks {
  /** TIFF-structured EXIF payload, if any. */
  exif?: Uint8Array;
  xmp: boolean;
  iptc: boolean;
  comment: boolean;
  text: boolean;
  icc: boolean;
}

function newBlocks(): Blocks {
  return { xmp: false, iptc: false, comment: false, text: false, icc: false };
}

function summarize(blocks: Blocks): MetadataSummary {
  const exif = blocks.exif ? readExif(blocks.exif) : { entries: [], orientation: 1 };
  const entries = [...exif.entries];
  if (blocks.xmp) entries.push({ label: 'XMP', value: 'Embedded (editing history, ratings, …)' });
  if (blocks.iptc) entries.push({ label: 'IPTC', value: 'Embedded (captions, keywords, …)' });
  if (blocks.comment) entries.push({ label: 'Comment', value: 'Embedded' });
  if (blocks.text) entries.push({ label: 'Text', value: 'Embedded text chunks' });
  if (blocks.icc) entries.push({ label: 'Color profile', value: 'Embedded (kept)' });
  return { entries, orientation: exif.orientation };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length && offset + i < bytes.length; i++) {
    text += String.fromCharCode(bytes[offset + i]);
  }
  return text;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// --- JPEG ------------------------------------------------------------------------

interface JpegSegment {
  marker: number;
  start: number;
  /** End of the segment (exclusive). */
  end: number;
  /** Start of the payload (after marker + length). */
  data: number;
}

/** The segments before the image data, and where the image data (SOS) starts. */
function jpegSegments(bytes: Uint8Array): { segments: JpegSegment[]; scan: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segments: JpegSegment[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('Bad JPEG marker');
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xda) return { segments, scan: offset };
    const length = view.getUint16(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error('Truncated JPEG');
    segments.push({ marker, start: offset, end, data: offset + 4 });
    offset = end;
  }
  throw new Error('JPEG without image data');
}

function jpegBlocks(bytes: Uint8Array): Blocks {
  const blocks = newBlocks();
  for (const segment of jpegSegments(bytes).segments) {
    const id = ascii(bytes, segment.data, 29);
    if (segment.marker === 0xe1 && id.startsWith('Exif\0\0')) {
      blocks.exif = bytes.subarray(segment.data + 6, segment.end);
    } else if (segment.marker === 0xe1 && id.startsWith('http://ns.adobe.com/')) {
      blocks.xmp = true;
    } else if (segment.marker === 0xed) {
      blocks.iptc = true;
    } else if (segment.marker === 0xfe) {
      blocks.comment = true;
    } else if (segment.marker === 0xe2 && id.startsWith('ICC_PROFILE')) {
      blocks.icc = true;
    }
  }
  return blocks;
}

/** APPn segments that carry rendering information, not metadata. */
function keepJpegSegment(bytes: Uint8Array, segment: JpegSegment): boolean {
  const { marker } = segment;
  if (marker === 0xfe) return false; // comment
  if (marker < 0xe0 || marker > 0xef) return true; // not APPn: tables, frame header, ...
  const id = ascii(bytes, segment.data, 12);
  return (
    (marker === 0xe0 && (id.startsWith('JFIF') || id.startsWith('JFXX'))) ||
    (marker === 0xe2 && id.startsWith('ICC_PROFILE')) ||
    (marker === 0xee && id.startsWith('Adobe')) // color transform flag: needed to decode
  );
}

function stripJpeg(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const { segments, scan } = jpegSegments(bytes);
  const { orientation } = summarize(jpegBlocks(bytes));
  const kept = segments.filter((segment) => keepJpegSegment(bytes, segment));
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  // JFIF wants to be first; the orientation EXIF block goes right after it.
  const jfif = kept[0]?.marker === 0xe0 ? kept.shift() : undefined;
  if (jfif) parts.push(bytes.subarray(jfif.start, jfif.end));
  if (orientation !== 1) parts.push(orientationExifSegment(orientation));
  for (const segment of kept) parts.push(bytes.subarray(segment.start, segment.end));
  parts.push(bytes.subarray(scan));
  return concat(parts);
}

/** An APP1 EXIF segment holding only the orientation tag. */
function orientationExifSegment(orientation: number): Uint8Array {
  const segment = new Uint8Array(36);
  const view = new DataView(segment.buffer);
  view.setUint16(0, 0xffe1);
  view.setUint16(2, 34); // length, excluding the marker
  segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  segment.set([0x4d, 0x4d, 0, 0x2a], 10); // big-endian TIFF header
  view.setUint32(14, 8); // IFD0 offset
  view.setUint16(18, 1); // one entry
  view.setUint16(20, 0x0112); // Orientation
  view.setUint16(22, 3); // SHORT
  view.setUint32(24, 1); // count
  view.setUint16(28, orientation);
  view.setUint32(32, 0); // no next IFD
  return segment;
}

// --- PNG -------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_METADATA = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

interface Chunk {
  type: string;
  start: number;
  end: number;
  data: number;
  size: number;
}

function pngChunks(bytes: Uint8Array): Chunk[] {
  if (!PNG_SIGNATURE.every((value, i) => bytes[i] === value)) throw new Error('Not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) throw new Error('Truncated PNG');
    const type = ascii(bytes, offset + 4, 4);
    chunks.push({ type, start: offset, end, data: offset + 8, size });
    offset = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function pngBlocks(bytes: Uint8Array): Blocks {
  const blocks = newBlocks();
  for (const chunk of pngChunks(bytes)) {
    if (chunk.type === 'eXIf') blocks.exif = bytes.subarray(chunk.data, chunk.data + chunk.size);
    else if (chunk.type === 'iTXt' && ascii(bytes, chunk.data, 17) === 'XML:com.adobe.xmp')
      blocks.xmp = true;
    else if (chunk.type === 'tEXt' || chunk.type === 'zTXt' || chunk.type === 'iTXt')
      blocks.text = true;
    else if (chunk.type === 'iCCP') blocks.icc = true;
  }
  return blocks;
}

function stripPng(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  // Dropping a rotated EXIF orientation would turn the image; re-encode instead.
  if (summarize(pngBlocks(bytes)).orientation !== 1) return null;
  const chunks = pngChunks(bytes).filter((chunk) => !PNG_METADATA.has(chunk.type));
  return concat([bytes.subarray(0, 8), ...chunks.map((c) => bytes.subarray(c.start, c.end))]);
}

// --- WebP ------------------------------------------------------------------------

function webpChunks(bytes: Uint8Array): Chunk[] {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') throw new Error('Not a WebP');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2); // chunks are padded to even sizes
    if (offset + 8 + size > bytes.length) throw new Error('Truncated WebP');
    chunks.push({
      type: ascii(bytes, offset, 4),
      start: offset,
      end: Math.min(end, bytes.length),
      data: offset + 8,
      size,
    });
    offset = end;
  }
  return chunks;
}

function webpBlocks(bytes: Uint8Array): Blocks {
  const blocks = newBlocks();
  for (const chunk of webpChunks(bytes)) {
    if (chunk.type === 'EXIF') {
      let exif = bytes.subarray(chunk.data, chunk.data + chunk.size);
      // Some writers keep the JPEG-style "Exif\0\0" prefix.
      if (ascii(exif, 0, 6) === 'Exif\0\0') exif = exif.subarray(6);
      blocks.exif = exif;
    } else if (chunk.type === 'XMP ') blocks.xmp = true;
    else if (chunk.type === 'ICCP') blocks.icc = true;
  }
  return blocks;
}

function stripWebp(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (summarize(webpBlocks(bytes)).orientation !== 1) return null;
  const parts = webpChunks(bytes)
    .filter((chunk) => chunk.type !== 'EXIF' && chunk.type !== 'XMP ')
    .map((chunk) => {
      const part = bytes.slice(chunk.start, chunk.end);
      // VP8X feature flags: clear "has EXIF" (0x08) and "has XMP" (0x04).
      if (chunk.type === 'VP8X') part[8] &= ~0x0c;
      return part;
    });
  const out = concat([bytes.subarray(0, 12), ...parts]);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

// --- EXIF (TIFF) ---------------------------------------------------------------

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
} as const;

interface TagValue {
  text?: string;
  numeric?: number;
}

/** Summarize a TIFF-structured EXIF payload (what a camera/phone embeds). */
function readExif(tiff: Uint8Array): { entries: MetadataEntry[]; orientation: number } {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (tiff.length < 8) return { entries: [], orientation: 1 };
  const order = view.getUint16(0);
  const little = order === 0x4949;
  if ((!little && order !== 0x4d4d) || view.getUint16(2, little) !== 42) {
    return { entries: [], orientation: 1 };
  }

  const ifd0 = readIfd(tiff, view, view.getUint32(4, little), little);
  const exifPointer = ifd0.get(TAG.exifIfd)?.numeric;
  const exif = exifPointer === undefined ? new Map() : readIfd(tiff, view, exifPointer, little);
  const gpsPointer = ifd0.get(TAG.gpsIfd)?.numeric;
  const hasGps = gpsPointer !== undefined && readIfd(tiff, view, gpsPointer, little).size > 0;

  const entries: MetadataEntry[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value) entries.push({ label, value });
  };
  const camera = [ifd0.get(TAG.make)?.text, ifd0.get(TAG.model)?.text].filter(Boolean).join(' ');
  push('Camera', camera || undefined);
  push('Taken', exif.get(TAG.dateTimeOriginal)?.text ?? ifd0.get(TAG.dateTime)?.text);
  push('Software', ifd0.get(TAG.software)?.text);
  push('Author', ifd0.get(TAG.artist)?.text);
  push('Copyright', ifd0.get(TAG.copyright)?.text);
  push('Description', ifd0.get(TAG.description)?.text);
  if (hasGps) push('GPS location', 'Embedded in the file');

  const rawOrientation = ifd0.get(TAG.orientation)?.numeric ?? 1;
  const orientation = rawOrientation >= 1 && rawOrientation <= 8 ? rawOrientation : 1;
  if (orientation > 1) push('Orientation', `Rotated/flipped on display (EXIF ${orientation})`);
  return { entries, orientation };
}

function readIfd(
  tiff: Uint8Array,
  view: DataView,
  offset: number,
  little: boolean,
): Map<number, TagValue> {
  const tags = new Map<number, TagValue>();
  if (offset + 2 > tiff.length) return tags;
  const count = view.getUint16(offset, little);
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const valueCount = view.getUint32(entry + 4, little);
    if (type === 2) {
      // ASCII: inline when it fits in 4 bytes, otherwise behind an offset.
      const at = valueCount <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
      if (at + valueCount <= tiff.length) {
        const text = ascii(tiff, at, valueCount).replace(/\0+$/, '').trim();
        if (text) tags.set(tag, { text });
      }
    } else if (type === 3 && valueCount === 1) {
      tags.set(tag, { numeric: view.getUint16(entry + 8, little) });
    } else if (type === 4 && valueCount === 1) {
      tags.set(tag, { numeric: view.getUint32(entry + 8, little) });
    } else {
      tags.set(tag, {}); // other types only matter as "present" (e.g. GPS rationals)
    }
  }
  return tags;
}
