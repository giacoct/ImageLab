import { describe, expect, it } from 'vitest';

import { buildFilter } from './adjustments';

const neutral = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  invert: false,
  blur: 0,
};

describe('buildFilter', () => {
  it('always includes the three base filters', () => {
    expect(buildFilter(neutral)).toBe('brightness(100%) contrast(100%) saturate(100%)');
  });

  it('adds the optional filters only when active', () => {
    expect(buildFilter({ ...neutral, grayscale: 50, invert: true, blur: 2 })).toBe(
      'brightness(100%) contrast(100%) saturate(100%) grayscale(50%) invert(100%) blur(2px)',
    );
  });
});
