/** Binary-search steps: ~0.7% precision on the searched value. */
const STEPS = 7;

/**
 * Find the largest `value` in [low, high] whose encoding fits `targetBytes`
 * (quality for lossy formats, a scale factor for PNG). Returns the best
 * fitting result, or the smallest achievable one when nothing fits, so the
 * user still gets a file (its size shows that it's over budget).
 */
export async function largestThatFits<T extends { size: number }>(
  encode: (value: number) => Promise<T>,
  targetBytes: number,
  low: number,
  high: number,
): Promise<T> {
  let best: T | null = null;
  for (let step = 0; step < STEPS; step++) {
    const mid = (low + high) / 2;
    const candidate = await encode(mid);
    if (candidate.size <= targetBytes) {
      best = candidate;
      low = mid;
    } else {
      high = mid;
    }
  }
  return best ?? (await encode(low));
}
