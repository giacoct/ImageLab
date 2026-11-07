import { describe, expect, it } from 'vitest';

import { largestThatFits } from './search';
import { restoreSize, tracerConfig } from './vector';

describe('largestThatFits', () => {
  // A fake encoder whose output grows linearly with the quality.
  const encode = async (quality: number) => ({ quality, size: Math.round(quality * 1000) });

  it('finds the highest quality under the budget', async () => {
    const result = await largestThatFits(encode, 600, 0.05, 0.95);
    expect(result.size).toBeLessThanOrEqual(600);
    expect(result.quality).toBeGreaterThan(0.58);
  });

  it('returns the smallest result when nothing fits', async () => {
    const result = await largestThatFits(encode, 1, 0.05, 0.95);
    expect(result.quality).toBeLessThan(0.06);
  });
});

describe('vector settings', () => {
  it('converts to the converter units', () => {
    const config = tracerConfig({
      mode: 'spline',
      colorPrecision: 6,
      filterSpeckle: 4,
      layerDifference: 16,
      cornerThreshold: 180,
      lengthThreshold: 4,
      pathPrecision: 3,
    });
    expect(config).toMatchObject({ filterSpeckle: 16, colorPrecision: 2, layerDifference: 16 });
    expect(config.cornerThreshold).toBeCloseTo(Math.PI);
  });

  it('restores the original size with a viewBox', () => {
    const svg = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="400" height="200">';
    expect(restoreSize(svg, { width: 100, height: 50 }, { width: 400, height: 200 })).toContain(
      'width="100" height="50" viewBox="0 0 400 200"',
    );
  });
});
