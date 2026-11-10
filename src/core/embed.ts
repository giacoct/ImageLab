/**
 * Metadata written into the JPEG, PNG and WebP files the app makes: the EXIF
 * carried from the photo (`exif.ts`) and the color profile of a wide-gamut
 * image (`color.ts`). The encoders write neither; this adds them to the file
 * they wrote, where each format keeps them.
 */

import { crc32 } from "./zip";

export interface Embedded {
  /** An EXIF payload (a TIFF structure). */
  exif?: Uint8Array | null;
  /** An ICC color profile. */
  icc?: Uint8Array | null;
}

/**
 * The file with `exif` and `icc` in it, or null for another format. What
 * doesn't fit (a JPEG segment holds 64 KB) is left out.
 */
export function embedMetadata(
  file: Uint8Array,
  { exif = null, icc = null }: Embedded,
): Uint8Array<ArrayBuffer> | null {
  const ascii = (from: number, length: number) =>
    String.fromCharCode(...file.subarray(from, from + length));
  if (file[0] === 0xff && file[1] === 0xd8) return jpegWith(file, exif, icc);
  if (file[0] === 0x89 && ascii(1, 3) === "PNG")
    return pngWith(file, exif, icc);
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    return webpWith(file, exif, icc);
  return null;
}

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

// --- JPEG ------------------------------------------------------------------------

/** An APPn segment, or null if `payload` is too large for one. */
function segment(marker: number, head: number[], payload: Uint8Array) {
  const length = 2 + head.length + payload.length;
  if (length > 0xffff) return null;
  const out = new Uint8Array(2 + length);
  out.set([0xff, marker, length >> 8, length & 255, ...head]);
  out.set(payload, 4 + head.length);
  return out;
}

/** APP1 (EXIF) and APP2 (ICC) segments, after the JFIF one if there's one (it comes first). */
function jpegWith(
  file: Uint8Array,
  exif: Uint8Array | null,
  icc: Uint8Array | null,
): Uint8Array<ArrayBuffer> {
  const segments = [
    exif && segment(0xe1, text("Exif\0\0"), exif),
    // One profile in one segment: number 1 of 1.
    icc && segment(0xe2, [...text("ICC_PROFILE\0"), 1, 1], icc),
  ].filter((part) => part !== null);
  let at = 2;
  if (file[2] === 0xff && file[3] === 0xe0) at = 4 + ((file[4] << 8) | file[5]);
  return concat(file.subarray(0, at), ...segments, file.subarray(at));
}

// --- PNG -------------------------------------------------------------------------

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(text(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** `iCCP` and `eXIf` chunks right after the header (IHDR), before the image data. */
function pngWith(
  file: Uint8Array,
  exif: Uint8Array | null,
  icc: Uint8Array | null,
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  if (icc) {
    const name = text("ICC Profile\0");
    const data = new Uint8Array([...name, 0, ...zlibStored(icc)]); // 0: deflate
    chunks.push(chunk("iCCP", data));
  }
  if (exif) chunks.push(chunk("eXIf", exif));
  const ihdrEnd =
    8 + 12 + new DataView(file.buffer, file.byteOffset).getUint32(8);
  return concat(file.subarray(0, ihdrEnd), ...chunks, file.subarray(ihdrEnd));
}

/** A zlib stream holding `data` as is (stored blocks: a profile is small). */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks: number[] = [0x78, 0x01];
  for (let at = 0; at < data.length || at === 0; at += 0xffff) {
    const part = data.subarray(at, at + 0xffff);
    const last = at + 0xffff >= data.length ? 1 : 0;
    const n = part.length;
    blocks.push(last, n & 255, n >> 8, ~n & 255, (~n >> 8) & 255, ...part);
  }
  // Adler-32 of the data.
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  blocks.push(b >> 8, b & 255, a >> 8, a & 255);
  return new Uint8Array(blocks);
}

// --- WebP ------------------------------------------------------------------------

/**
 * An `ICCP` chunk after the header and an `EXIF` chunk at the end. That
 * takes the extended format: a simple WebP (one `VP8 ` or `VP8L` chunk) gets
 * a `VP8X` header with its size and whether it has alpha, read from the
 * bitstream.
 */
function webpWith(
  file: Uint8Array,
  exif: Uint8Array | null,
  icc: Uint8Array | null,
): Uint8Array<ArrayBuffer> | null {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const first = String.fromCharCode(...file.subarray(12, 16));
  let head: Uint8Array;
  let body = file.subarray(12);
  if (first === "VP8X") {
    head = file.slice(12, 30);
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
    head.set([...text("VP8X"), 10, 0, 0, 0]);
    head[8] = alpha ? 0x10 : 0;
    head.set(uint24(width - 1), 12);
    head.set(uint24(height - 1), 15);
  }
  if (icc) head[8] |= 0x20;
  if (exif) head[8] |= 0x08;
  const out = concat(
    file.subarray(0, 12),
    head,
    icc ? riffChunk("ICCP", icc) : new Uint8Array(),
    body,
    exif ? riffChunk("EXIF", exif) : new Uint8Array(),
  );
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

/** A RIFF chunk, padded to an even size. */
function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set(text(type));
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
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
