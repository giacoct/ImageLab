import { describe, expect, it } from 'vitest';

import { formatToWrite, initialEncoding } from './encoding';

describe('encoding', () => {
  it('starts from the input format', () => {
    expect(initialEncoding('image/webp').format).toBe('image/webp');
    expect(initialEncoding('image/heic').format).toBe('image/jpeg');
  });

  it('turns a kept JPEG into PNG when it has transparency', () => {
    const kept = initialEncoding('image/gif');
    expect(formatToWrite(kept, () => false)).toBe('image/jpeg');
    expect(formatToWrite(kept, () => true)).toBe('image/png');
    expect(formatToWrite({ ...kept, chosen: true }, () => true)).toBe('image/jpeg');
  });
});
