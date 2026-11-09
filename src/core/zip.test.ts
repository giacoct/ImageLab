import { describe, expect, it } from 'vitest';

import { crc32, zipParts } from './zip';

describe('zipParts', () => {
  it('writes a stored archive with UTF-8 names', async () => {
    const data = new TextEncoder().encode('hello');
    const parts = zipParts([
      { name: 'città.txt', data, size: data.length, crc: crc32(data) },
    ]);
    expect(parts[1]).toBe(data); // the content is passed through, not copied
    const zip = new Uint8Array(await new Blob(parts).arrayBuffer());
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(view.getUint32(14, true)).toBe(crc32(data));
    // End of central directory: one entry.
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(1);
  });

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
