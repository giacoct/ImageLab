import { describe, expect, it } from 'vitest';

import { defaults, p } from './params';

describe('params', () => {
  it('builds independent defaults', () => {
    const schema = {
      size: p.number({ label: 'Size', default: 50, min: 1, max: 100 }),
      flag: p.boolean({ label: 'Flag', default: false }),
      box: p.custom({ label: 'Box', default: { x: 0 } }),
    };
    const values = defaults(schema);
    expect(values).toEqual({ size: 50, flag: false, box: { x: 0 } });
    expect(values.box).not.toBe(schema.box.default);
  });

  it('shows long choices as a drop-down', () => {
    const option = (value: string) => ({ value, label: value });
    expect(
      p.choice({ label: 'Few', default: 'a', options: ['a', 'b'].map(option) })
        .display,
    ).toBe('segmented');
    expect(
      p.choice({
        label: 'Many',
        default: 'a',
        options: ['a', 'b', 'c', 'd', 'e'].map(option),
      }).display,
    ).toBe('select');
  });
});
