import { describe, expect, it } from 'vitest';

import { keyBackgroundPixels, sharpenPixels } from './pixel-ops';

/** One RGBA pixel per group of four values. */
function pixels(...values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values);
}

describe('keyBackgroundPixels', () => {
  it('turns pixels matching the key color transparent', () => {
    const data = pixels(255, 255, 255, 255, 0, 0, 0, 255);
    keyBackgroundPixels(data, { color: '#ffffff', tolerance: 10, edgeSmoothing: 0 });

    expect(data[3]).toBe(0); // white matches
    expect(data[7]).toBe(255); // black is far outside the tolerance
  });

  it('feathers alpha inside the smoothing band', () => {
    // Distance from white: 3-channel delta of 40 each ≈ 69.3.
    const data = pixels(215, 215, 215, 255);
    keyBackgroundPixels(data, { color: '#ffffff', tolerance: 10, edgeSmoothing: 30 });

    expect(data[3]).toBeGreaterThan(0);
    expect(data[3]).toBeLessThan(255);
  });

  it('supports 3-digit hex colors', () => {
    const data = pixels(255, 0, 0, 255);
    keyBackgroundPixels(data, { color: '#f00', tolerance: 5, edgeSmoothing: 0 });

    expect(data[3]).toBe(0);
  });
});

describe('sharpenPixels', () => {
  it('leaves uniform areas unchanged and preserves alpha', () => {
    const src = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < src.length; i += 4) {
      src[i] = src[i + 1] = src[i + 2] = 100;
      src[i + 3] = 200;
    }

    const out = sharpenPixels(src, 3, 3, 0.8);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(100);
      expect(out[i + 3]).toBe(200);
    }
  });

  it('amplifies a bright center pixel against dark neighbors', () => {
    const src = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < src.length; i += 4) {
      src[i] = src[i + 1] = src[i + 2] = 50;
      src[i + 3] = 255;
    }
    const center = (1 * 3 + 1) * 4;
    src[center] = src[center + 1] = src[center + 2] = 150;

    const out = sharpenPixels(src, 3, 3, 0.5);
    expect(out[center]).toBeGreaterThan(150);
  });
});
