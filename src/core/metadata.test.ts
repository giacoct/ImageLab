import { describe, expect, it } from 'vitest';

import { readMetadata, stripMetadata } from './metadata';

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [n >> 8, n & 255];
const u32 = (n: number) => [...u16(n >>> 16), ...u16(n & 0xffff)];
const u32le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];

/** A big-endian TIFF: Make "Cam", orientation, and a GPS IFD with one tag. */
function tiff(orientation: number): number[] {
  const entry = (tag: number, type: number, count: number, value: number[]) => [
    ...u16(tag),
    ...u16(type),
    ...u32(count),
    ...value,
  ];
  const ifd0 = 8;
  const gpsAt = ifd0 + 2 + 3 * 12 + 4;
  return [
    ...text('MM'),
    ...u16(42),
    ...u32(ifd0),
    ...u16(3),
    ...entry(0x010f, 2, 4, text('Cam\0')),
    ...entry(0x0112, 3, 1, [...u16(orientation), 0, 0]),
    ...entry(0x8825, 4, 1, u32(gpsAt)),
    ...u32(0),
    ...u16(1),
    ...entry(0x0001, 2, 2, [...text('N\0'), 0, 0]),
    ...u32(0),
  ];
}

const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...u16(payload.length + 2),
  ...payload,
];
const scan = [0xff, 0xda, ...u16(4), 1, 2, 9, 9, 0xff, 0xd9];

function jpeg(orientation = 6): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...text('Exif\0\0'), ...tiff(orientation)]),
    ...segment(0xfe, text('hello')),
    ...segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1]),
    ...scan,
  ]);
}

describe('metadata', () => {
  it('summarizes a JPEG', () => {
    expect(readMetadata(jpeg())).toEqual({
      found: ['Camera: Cam', 'GPS location', 'Comment'],
      orientation: 6,
    });
  });

  it('strips a JPEG, keeping the image data, color profile and orientation', () => {
    const stripped = stripMetadata(jpeg())!;
    expect(readMetadata(stripped)).toEqual({ found: ['EXIF data'], orientation: 6 });
    const bytes = [...stripped];
    expect(bytes.slice(-scan.length)).toEqual(scan);
    expect(String.fromCharCode(...bytes)).toContain('ICC_PROFILE');
    expect(String.fromCharCode(...bytes.slice(6, 10))).toBe('JFIF'); // still first
    expect(readMetadata(stripMetadata(jpeg(1))!).found).toEqual([]);
  });

  it('strips text chunks from a PNG', () => {
    const chunk = (type: string, data: number[]) => [
      ...u32(data.length),
      ...text(type),
      ...data,
      0,
      0,
      0,
      0,
    ];
    const png = new Uint8Array([
      0x89,
      ...text('PNG\r\n\x1a\n'),
      ...chunk('IHDR', Array(13).fill(0)),
      ...chunk('tEXt', text('Author\0me')),
      ...chunk('IDAT', [1, 2, 3]),
      ...chunk('IEND', []),
    ]);
    expect(readMetadata(png).found).toEqual(['Text notes']);
    const stripped = stripMetadata(png)!;
    expect(stripped.length).toBe(png.length - (12 + 9));
    expect(readMetadata(stripped).found).toEqual([]);
  });

  it('strips EXIF and XMP from a WebP and fixes its header', () => {
    const chunk = (type: string, data: number[]) => [...text(type), ...u32le(data.length), ...data];
    const body = [
      ...text('WEBP'),
      ...chunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ...chunk('VP8 ', [1, 2]),
      ...chunk('EXIF', tiff(1)),
      ...chunk('XMP ', text('<x/>')),
    ];
    const webp = new Uint8Array([...text('RIFF'), ...u32le(body.length), ...body]);
    expect(readMetadata(webp).found).toEqual([
      'Camera: Cam',
      'GPS location',
      'XMP (editing history, ratings…)',
    ]);
    const stripped = stripMetadata(webp)!;
    expect(readMetadata(stripped).found).toEqual([]);
    expect(stripped[20] & 0x0c).toBe(0);
    expect(new DataView(stripped.buffer).getUint32(4, true)).toBe(stripped.length - 8);
  });

  it('leaves other and malformed files alone', () => {
    expect(stripMetadata(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(stripMetadata(jpeg().subarray(0, 30))).toBeNull();
    expect(readMetadata(new Uint8Array([0xff, 0xd8, 0, 0]))).toEqual({ found: [], orientation: 1 });
  });
});
