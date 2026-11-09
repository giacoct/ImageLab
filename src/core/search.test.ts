import { describe, expect, it } from 'vitest';

import { largestThatFits } from './search';

describe('largestThatFits', () => {
  // A fake encoder whose output grows linearly with the quality.
  const encode = async (quality: number) => ({
    quality,
    size: Math.round(quality * 1000),
  });

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
