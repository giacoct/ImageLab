/** Wrap a PNG in a single-image ICO container (PNG-compressed entries are valid ICO). */
export function pngToIco(png: Uint8Array, size: number): Uint8Array<ArrayBuffer> {
  const header = 6;
  const entry = 16;
  const bytes = new Uint8Array(header + entry + png.length);
  const view = new DataView(bytes.buffer);
  const dimension = size >= 256 ? 0 : size; // 0 means 256 in the ICO format

  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, 1, true); // image count
  view.setUint8(6, dimension); // width
  view.setUint8(7, dimension); // height
  view.setUint16(10, 1, true); // color planes
  view.setUint16(12, 32, true); // bits per pixel
  view.setUint32(14, png.length, true); // image data size
  view.setUint32(18, header + entry, true); // image data offset
  bytes.set(png, header + entry);
  return bytes;
}
