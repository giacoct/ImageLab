import { describe, expect, it } from 'vitest';

import { ZipEntry, createZip, dedupeNames } from './zip';

function entry(name: string): ZipEntry {
  return { name, blob: new Blob(['x']) };
}

describe('dedupeNames', () => {
  it('keeps unique names and numbers duplicates before the extension', () => {
    const entries = dedupeNames([entry('a.png'), entry('a.png'), entry('b.png')]);
    expect(entries.map((entry) => entry.name)).toEqual(['a.png', 'a-2.png', 'b.png']);
  });

  it('handles names without an extension', () => {
    const entries = dedupeNames([entry('raw'), entry('raw')]);
    expect(entries.map((entry) => entry.name)).toEqual(['raw', 'raw-2']);
  });
});

describe('createZip', () => {
  it('produces a well-formed STORE archive', async () => {
    const zip = await createZip([
      { name: 'hello.txt', blob: new Blob(['hello']) },
      { name: 'world.txt', blob: new Blob(['world']) },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);

    // Local file header signature at the start.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // CRC-32 of "hello".
    expect(view.getUint32(14, true)).toBe(0x3610a686);
    // Sizes (compressed = uncompressed under STORE).
    expect(view.getUint32(18, true)).toBe(5);
    expect(view.getUint32(22, true)).toBe(5);

    // End-of-central-directory record at the tail, listing both entries.
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 8, true)).toBe(2);
    expect(view.getUint16(eocd + 10, true)).toBe(2);

    // The central directory points back at a valid offset.
    const centralOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });

  it('marks file names as UTF-8 so accented names survive', async () => {
    const zip = await createZip([{ name: 'città.jpg', blob: new Blob(['x']) }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800); // local header flags
    const name = new TextDecoder().decode(bytes.subarray(30, 30 + view.getUint16(26, true)));
    expect(name).toBe('città.jpg');
  });

  it('zips empty input into an empty archive', async () => {
    const zip = await createZip([]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(bytes.length).toBe(22);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});
