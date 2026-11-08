import { describe, expect, it } from 'vitest';

import { defaults, p, sanitize } from './params';

const schema = {
  size: p.number({ label: 'Size', default: 50, min: 1, max: 100 }),
  mode: p.choice({
    label: 'Mode',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  }),
  flag: p.boolean({ label: 'Flag', default: false }),
  color: p.color({ label: 'Color', default: '#ffffff' }),
};

describe('params', () => {
  it('builds defaults', () => {
    expect(defaults(schema)).toEqual({ size: 50, mode: 'a', flag: false, color: '#ffffff' });
  });

  it('sanitizes untrusted values', () => {
    expect(
      sanitize(schema, { size: 500, mode: 'zzz', flag: 'yes', color: '#ABCDEF', extra: 1 }),
    ).toEqual({ size: 100, mode: 'a', flag: false, color: '#abcdef' });
    expect(sanitize(schema, null)).toEqual(defaults(schema));
  });
});
