import { describe, expect, it } from 'vitest';

import { hexToRgb } from './color';

describe('hexToRgb', () => {
  it('parses 6- and 3-digit hex colors', () => {
    expect(hexToRgb('#0b766f')).toEqual({ red: 11, green: 118, blue: 111 });
    expect(hexToRgb('#f00')).toEqual({ red: 255, green: 0, blue: 0 });
  });

  it('falls back to white for unparsable input', () => {
    expect(hexToRgb('nope')).toEqual({ red: 255, green: 255, blue: 255 });
  });
});
