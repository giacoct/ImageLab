/**
 * Minimal EXIF reader for JPEG files: just enough to show the user which
 * privacy-relevant metadata is embedded before the Strip metadata tool
 * removes it. Anything unexpected results in an empty summary, never an
 * error — the viewer is informational.
 */

export interface ExifEntry {
  label: string;
  value: string;
}

// Tag ids in IFD0 / the EXIF sub-IFD.
const TAG_IMAGE_DESCRIPTION = 0x010e;
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_ORIENTATION = 0x0112;
const TAG_SOFTWARE = 0x0131;
const TAG_DATETIME = 0x0132;
const TAG_ARTIST = 0x013b;
const TAG_COPYRIGHT = 0x8298;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;

/** EXIF data lives in the APP1 segment at the start of the file. */
const HEADER_BYTES = 256 * 1024;

/**
 * Read a human-readable summary of the EXIF metadata in `file`. Returns an
 * empty list for non-JPEG files, JPEGs without EXIF, and anything malformed.
 */
export async function readExifSummary(file: File): Promise<ExifEntry[]> {
  if (file.type !== 'image/jpeg') {
    return [];
  }

  try {
    const buffer = await file.slice(0, HEADER_BYTES).arrayBuffer();
    const tiffOffset = findExifTiffOffset(new DataView(buffer));
    if (tiffOffset === null) {
      return [];
    }
    return summarizeTiff(new DataView(buffer), tiffOffset);
  } catch {
    return [];
  }
}

/** Walk the JPEG segment list to the APP1 "Exif\0\0" payload (TIFF header). */
function findExifTiffOffset(view: DataView): number | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      return null;
    }
    const marker = view.getUint8(offset + 1);

    // Standalone markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    // Start of scan: image data follows, no more metadata segments.
    if (marker === 0xda) {
      return null;
    }

    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > view.byteLength) {
      return null;
    }

    if (marker === 0xe1 && length >= 10 && readAscii(view, offset + 4, 6) === 'Exif\0\0') {
      return offset + 10;
    }

    offset += 2 + length;
  }

  return null;
}

function summarizeTiff(view: DataView, tiff: number): ExifEntry[] {
  if (tiff + 8 > view.byteLength) {
    return [];
  }

  const order = view.getUint16(tiff);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) {
    return [];
  }
  if (view.getUint16(tiff + 2, little) !== 42) {
    return [];
  }

  const ifd0 = readIfd(view, tiff, view.getUint32(tiff + 4, little), little);
  const exifPointer = ifd0.get(TAG_EXIF_IFD)?.numeric;
  const exifIfd =
    exifPointer === undefined
      ? new Map<number, TagValue>()
      : readIfd(view, tiff, exifPointer, little);
  const gpsPointer = ifd0.get(TAG_GPS_IFD)?.numeric;
  const hasGps =
    gpsPointer !== undefined && readIfd(view, tiff, gpsPointer, little).size > 0;

  const entries: ExifEntry[] = [];
  const push = (label: string, value: string | undefined): void => {
    if (value) {
      entries.push({ label, value });
    }
  };

  const make = ifd0.get(TAG_MAKE)?.text;
  const model = ifd0.get(TAG_MODEL)?.text;
  push('Camera', [make, model].filter(Boolean).join(' ') || undefined);
  push('Taken', exifIfd.get(TAG_DATETIME_ORIGINAL)?.text ?? ifd0.get(TAG_DATETIME)?.text);
  push('Software', ifd0.get(TAG_SOFTWARE)?.text);
  push('Author', ifd0.get(TAG_ARTIST)?.text);
  push('Copyright', ifd0.get(TAG_COPYRIGHT)?.text);
  push('Description', ifd0.get(TAG_IMAGE_DESCRIPTION)?.text);

  const orientation = ifd0.get(TAG_ORIENTATION)?.numeric;
  if (orientation !== undefined && orientation > 1) {
    push('Orientation', `Stored rotated/flipped (EXIF orientation ${orientation})`);
  }
  if (hasGps) {
    push('GPS location', 'Embedded in the file');
  }

  return entries;
}

interface TagValue {
  text?: string;
  numeric?: number;
}

/** Read one IFD into a tag → value map. Offsets are relative to the TIFF header. */
function readIfd(
  view: DataView,
  tiff: number,
  ifdOffset: number,
  little: boolean,
): Map<number, TagValue> {
  const tags = new Map<number, TagValue>();
  const start = tiff + ifdOffset;
  if (start + 2 > view.byteLength) {
    return tags;
  }

  const count = view.getUint16(start, little);
  for (let i = 0; i < count; i++) {
    const entry = start + 2 + i * 12;
    if (entry + 12 > view.byteLength) {
      break;
    }

    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const valueCount = view.getUint32(entry + 4, little);

    if (type === 2) {
      // ASCII: inline when it fits in 4 bytes, otherwise behind an offset.
      const dataOffset = valueCount <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, little);
      if (dataOffset + valueCount <= view.byteLength) {
        const text = readAscii(view, dataOffset, valueCount).replace(/\0+$/, '').trim();
        if (text) {
          tags.set(tag, { text });
        }
      }
    } else if (type === 3 && valueCount === 1) {
      tags.set(tag, { numeric: view.getUint16(entry + 8, little) });
    } else if (type === 4 && valueCount === 1) {
      tags.set(tag, { numeric: view.getUint32(entry + 8, little) });
    } else {
      // Other types only matter as "tag present" (e.g. GPS rationals).
      tags.set(tag, {});
    }
  }

  return tags;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i++) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}
