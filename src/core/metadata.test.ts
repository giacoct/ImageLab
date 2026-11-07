import { describe, expect, it } from 'vitest';

import { inspectMetadata, stripMetadata } from './metadata';
import { crc32 } from './zip';

/** A little-endian TIFF block: Make "Acme", Orientation `orientation`, one GPS entry. */
function tiff(orientation: number): Uint8Array {
  const bytes = new Uint8Array(72);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 3, true);
  const entries: [number, number, number, number][] = [
    [0x010f, 2, 5, 50], // Make → "Acme\0" at 50
    [0x0112, 3, 1, orientation],
    [0x8825, 4, 1, 56], // GPS IFD at 56
  ];
  entries.forEach(([tag, type, count, value], i) => {
    const at = 10 + i * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    if (type === 3) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
  });
  bytes.set([0x41, 0x63, 0x6d, 0x65, 0], 50);
  view.setUint16(56, 1, true);
  view.setUint16(58, 1, true);
  view.setUint16(60, 3, true);
  view.setUint32(62, 1, true);
  return bytes;
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint16(0, 0xff00 | marker);
  new DataView(out.buffer).setUint16(2, payload.length + 2);
  out.set(payload, 4);
  return out;
}

const text = (value: string) => new TextEncoder().encode(value);

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** SOI, JFIF, EXIF, comment, a quantization table, then "scan data" and EOI. */
function jpeg(orientation: number): Uint8Array {
  return join(
    new Uint8Array([0xff, 0xd8]),
    segment(0xe0, text('JFIF\0\x01\x02')),
    segment(0xe1, join(text('Exif\0\0'), tiff(orientation))),
    segment(0xfe, text('a comment')),
    segment(0xdb, new Uint8Array([0, 1, 2])),
    new Uint8Array([0xff, 0xda, 0, 2, 9, 9, 9, 0xff, 0xd9]),
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(text(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(): Uint8Array {
  return join(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('tEXt', text('Comment\0hi')),
    pngChunk('IDAT', new Uint8Array([1, 2, 3])),
    pngChunk('IEND', new Uint8Array()),
  );
}

function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set(text(type), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function webp(): Uint8Array {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x08 | 0x04; // EXIF + XMP flags
  const body = join(
    text('WEBP'),
    riffChunk('VP8X', vp8x),
    riffChunk('VP8 ', new Uint8Array([1, 2, 3])),
    riffChunk('EXIF', tiff(1)),
    riffChunk('XMP ', text('<x/>')),
  );
  const out = join(text('RIFF'), new Uint8Array(4), body);
  new DataView(out.buffer).setUint32(4, body.length, true);
  return out;
}

describe('inspectMetadata', () => {
  it('summarizes JPEG EXIF', () => {
    const summary = inspectMetadata(jpeg(6), 'image/jpeg');
    expect(summary.orientation).toBe(6);
    expect(summary.entries.map((e) => e.label)).toEqual([
      'Camera',
      'GPS location',
      'Orientation',
      'Comment',
    ]);
    expect(summary.entries[0].value).toBe('Acme');
  });

  it('finds PNG text and WebP EXIF/XMP', () => {
    expect(inspectMetadata(png(), 'image/png').entries.map((e) => e.label)).toEqual(['Text']);
    expect(inspectMetadata(webp(), 'image/webp').entries.map((e) => e.label)).toEqual([
      'Camera',
      'GPS location',
      'XMP',
    ]);
  });

  it('never throws on garbage', () => {
    expect(inspectMetadata(new Uint8Array([1, 2, 3]), 'image/jpeg').entries).toEqual([]);
    expect(inspectMetadata(new Uint8Array(), 'image/gif').entries).toEqual([]);
  });
});

describe('stripMetadata', () => {
  it('drops JPEG metadata and keeps the image data', () => {
    const stripped = stripMetadata(jpeg(1), 'image/jpeg')!;
    expect(inspectMetadata(stripped, 'image/jpeg').entries).toEqual([]);
    expect([...stripped.subarray(-9)]).toEqual([0xff, 0xda, 0, 2, 9, 9, 9, 0xff, 0xd9]);
    expect(stripped.length).toBeLessThan(jpeg(1).length);
  });

  it('keeps only the orientation of a rotated JPEG', () => {
    const stripped = stripMetadata(jpeg(6), 'image/jpeg')!;
    const summary = inspectMetadata(stripped, 'image/jpeg');
    expect(summary.orientation).toBe(6);
    expect(summary.entries.map((e) => e.label)).toEqual(['Orientation']);
  });

  it('drops PNG text chunks', () => {
    const stripped = stripMetadata(png(), 'image/png')!;
    expect(inspectMetadata(stripped, 'image/png').entries).toEqual([]);
    expect(stripped.length).toBe(png().length - 22);
  });

  it('drops WebP EXIF/XMP and fixes the header', () => {
    const stripped = stripMetadata(webp(), 'image/webp')!;
    const view = new DataView(stripped.buffer, stripped.byteOffset);
    expect(inspectMetadata(stripped, 'image/webp').entries).toEqual([]);
    expect(view.getUint32(4, true)).toBe(stripped.length - 8);
    expect(stripped[20] & 0x0c).toBe(0);
  });

  it('refuses formats it cannot clean losslessly', () => {
    expect(stripMetadata(new Uint8Array(10), 'image/avif')).toBeNull();
    expect(stripMetadata(new Uint8Array(10), 'image/jpeg')).toBeNull();
  });
});
