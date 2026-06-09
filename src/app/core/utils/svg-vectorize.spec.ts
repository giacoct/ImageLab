import { describe, expect, it } from 'vitest';

import { imageToSvg, quantize, traceColor, VectorImageData } from './svg-vectorize';

/** Build a flat RGBA buffer from `[r, g, b, a]` tuples in row-major order. */
function image(width: number, height: number, pixels: number[][]): VectorImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((pixel, index) => data.set(pixel, index * 4));
  return { data, width, height };
}

const RED: number[] = [255, 0, 0, 255];
const BLUE: number[] = [0, 0, 255, 255];
const CLEAR: number[] = [0, 0, 0, 0];

describe('svg-vectorize', () => {
  it('quantizes opaque pixels to a palette and indexes each pixel', () => {
    const { palette, indices } = quantize(image(2, 1, [RED, BLUE]), 2);

    expect(palette).toHaveLength(2);
    expect(indices[0]).not.toBe(indices[1]);
    expect(indices[0]).toBeGreaterThanOrEqual(0);
  });

  it('marks transparent pixels as background (-1)', () => {
    const { indices } = quantize(image(2, 1, [RED, CLEAR]), 2);

    expect(indices[0]).toBeGreaterThanOrEqual(0);
    expect(indices[1]).toBe(-1);
  });

  it('collapses a single color to one palette entry', () => {
    const { palette } = quantize(image(2, 2, [RED, RED, RED, RED]), 4);

    expect(palette).toHaveLength(1);
  });

  it('traces a solid region into one simplified rectangular loop', () => {
    const indices = Int32Array.from([0, 0, 0, 0]); // 2x2 all color 0

    expect(traceColor(indices, 0, 2, 2)).toBe('M0 0L2 0L2 2L0 2Z');
  });

  it('produces an SVG with the source size and a path per color', () => {
    const svg = imageToSvg(image(2, 2, [RED, RED, RED, RED]), {
      colors: 4,
      displayWidth: 64,
      displayHeight: 48,
    });

    expect(svg).toContain('width="64" height="48"');
    expect(svg).toContain('viewBox="0 0 2 2"');
    expect(svg).toContain('<path fill="#ff0000" d="M0 0L2 0L2 2L0 2Z"/>');
  });
});
