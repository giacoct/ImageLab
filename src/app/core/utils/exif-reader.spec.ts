import { describe, expect, it } from 'vitest';

import { readExifSummary } from './exif-reader';

/**
 * Build a minimal JPEG containing an EXIF APP1 segment with:
 * Make "Acme", Orientation 6, and a one-entry GPS IFD.
 */
function buildExifJpeg(): File {
  const tiff = new Uint8Array(72);
  const view = new DataView(tiff.buffer);

  // TIFF header: little-endian, magic 42, IFD0 at offset 8.
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  // IFD0 with three entries.
  view.setUint16(8, 3, true);
  let entry = 10;
  // Make (ASCII, 5 bytes incl. NUL, stored at offset 50).
  view.setUint16(entry, 0x010f, true);
  view.setUint16(entry + 2, 2, true);
  view.setUint32(entry + 4, 5, true);
  view.setUint32(entry + 8, 50, true);
  entry += 12;
  // Orientation (SHORT) = 6.
  view.setUint16(entry, 0x0112, true);
  view.setUint16(entry + 2, 3, true);
  view.setUint32(entry + 4, 1, true);
  view.setUint16(entry + 8, 6, true);
  entry += 12;
  // GPS IFD pointer (LONG) → offset 56.
  view.setUint16(entry, 0x8825, true);
  view.setUint16(entry + 2, 4, true);
  view.setUint32(entry + 4, 1, true);
  view.setUint32(entry + 8, 56, true);
  entry += 12;
  view.setUint32(entry, 0, true); // no next IFD

  tiff.set([0x41, 0x63, 0x6d, 0x65, 0], 50); // "Acme\0"

  // GPS IFD: one SHORT entry.
  view.setUint16(56, 1, true);
  view.setUint16(58, 0x0001, true);
  view.setUint16(60, 3, true);
  view.setUint32(62, 1, true);
  view.setUint16(66, 1, true);

  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
  const payloadLength = 2 + exifHeader.length + tiff.length;

  const jpeg = new Uint8Array(2 + 2 + payloadLength + 2 - 2);
  const jpegView = new DataView(jpeg.buffer);
  jpegView.setUint16(0, 0xffd8); // SOI
  jpegView.setUint16(2, 0xffe1); // APP1
  jpegView.setUint16(4, payloadLength); // segment length (includes itself)
  jpeg.set(exifHeader, 6);
  jpeg.set(tiff, 12);

  return new File([jpeg], 'photo.jpg', { type: 'image/jpeg' });
}

describe('readExifSummary', () => {
  it('reads camera, orientation, and GPS presence from a JPEG', async () => {
    const entries = await readExifSummary(buildExifJpeg());
    const byLabel = new Map(entries.map((entry) => [entry.label, entry.value]));

    expect(byLabel.get('Camera')).toBe('Acme');
    expect(byLabel.get('Orientation')).toContain('6');
    expect(byLabel.get('GPS location')).toBe('Embedded in the file');
  });

  it('returns an empty summary for non-JPEG files', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' });
    expect(await readExifSummary(file)).toEqual([]);
  });

  it('returns an empty summary for a JPEG without EXIF', async () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const file = new File([bare], 'bare.jpg', { type: 'image/jpeg' });
    expect(await readExifSummary(file)).toEqual([]);
  });

  it('never throws on malformed data', async () => {
    const garbage = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x12, 0x34]);
    const file = new File([garbage], 'broken.jpg', { type: 'image/jpeg' });
    expect(await readExifSummary(file)).toEqual([]);
  });
});
