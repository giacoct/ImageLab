/** Minimal ZIP writer (STORE method: images are already compressed). */

export interface ZipEntry<Data> {
  name: string;
  /** The file's content, as bytes or anything standing for them (e.g. a Blob). */
  data: Data;
  /** Length of the content in bytes. */
  size: number;
  /** CRC-32 of the content (see {@link crc32}). */
  crc: number;
}

/** General-purpose flag bit 11: file names are UTF-8 (so `città.jpg` unzips correctly). */
const UTF8_NAMES = 0x0800;

/**
 * The archive's parts in order: the headers as bytes, each entry's data as
 * given. `new Blob(parts)` then builds the file without copying every entry
 * into one buffer. Entry names must already be unique.
 */
export function zipParts<Data>(
  entries: readonly ZipEntry<Data>[],
): (Uint8Array<ArrayBuffer> | Data)[] {
  const encoder = new TextEncoder();
  const parts: (Uint8Array<ArrayBuffer> | Data)[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const { name: fileName, data, size, crc } of entries) {
    const name = encoder.encode(fileName);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, UTF8_NAMES, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size (stored)
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);

    const header = new Uint8Array(46 + name.length);
    const cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, UTF8_NAMES, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); // local header offset
    header.set(name, 46);
    central.push(header);

    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return [...parts, ...central, end];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
