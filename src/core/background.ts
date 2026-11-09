/**
 * Background removal by color (pure, on RGBA buffers): find the background
 * color from the image's edges, then make it transparent, either only where
 * it's connected to the edges (so the same color inside the subject stays) or
 * everywhere.
 */

import type { Pixels } from "./pixels";

export interface BackgroundOptions {
  /** `#rrggbb`. */
  color: string;
  /** 0–100: how far a color can be from `color` and still be fully removed. */
  tolerance: number;
  /** 0–100: band beyond the tolerance that fades out, for smooth edges. */
  softness: number;
  /** Remove only the background reachable from the image's edges. */
  connected: boolean;
}

/** Longest distance in RGB space (black ↔ white). */
const MAX_DISTANCE = Math.hypot(255, 255, 255);

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The color at (x, y), averaged with its neighbors within `radius` so a
 * noisy or JPEG pixel doesn't decide alone; mostly transparent pixels are
 * left out. `null` when there's none to go by (outside, or transparent).
 */
export function colorAt(
  { data, width, height }: Pixels,
  x: number,
  y: number,
  radius = 1,
): string | null {
  let [r, g, b, count] = [0, 0, 0, 0];
  for (let j = y - radius; j <= y + radius; j++) {
    for (let i = x - radius; i <= x + radius; i++) {
      if (i < 0 || j < 0 || i >= width || j >= height) continue;
      const k = (j * width + i) * 4;
      if (data[k + 3] < 128) continue;
      r += data[k];
      g += data[k + 1];
      b += data[k + 2];
      count += 1;
    }
  }
  return count ? rgbToHex(r / count, g / count, b / count) : null;
}

/**
 * The most common color along the image's border (opaque pixels, grouped
 * into buckets so noise and JPEG artifacts don't split the vote), averaged
 * within the winning bucket. White when the border is fully transparent.
 */
export function edgeColor({ data, width, height }: Pixels): string {
  const buckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return;
    const key =
      ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += data[i];
    bucket.g += data[i + 1];
    bucket.b += data[i + 2];
    buckets.set(key, bucket);
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    add(width - 1, y);
  }
  let best: { count: number; r: number; g: number; b: number } | undefined;
  for (const bucket of buckets.values())
    if (!best || bucket.count > best.count) best = bucket;
  return best
    ? rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count)
    : "#ffffff";
}

/** Make the background transparent, in place. */
export function removeBackground(
  { data, width, height }: Pixels,
  options: BackgroundOptions,
): void {
  const [kr, kg, kb] = hexToRgb(options.color);
  const limit = (clampPercent(options.tolerance) / 100) * MAX_DISTANCE;
  const band = (clampPercent(options.softness) / 100) * MAX_DISTANCE;

  /** 0 = background (remove), 1 = keep, in between = fade. */
  const keep = (p: number): number => {
    const i = p * 4;
    if (data[i + 3] === 0) return 0;
    const distance = Math.hypot(
      data[i] - kr,
      data[i + 1] - kg,
      data[i + 2] - kb,
    );
    if (distance <= limit) return 0;
    if (distance >= limit + band) return 1;
    return (distance - limit) / band;
  };
  const fade = (p: number, amount: number) => {
    data[p * 4 + 3] = Math.round(data[p * 4 + 3] * amount);
  };

  const count = width * height;
  if (!options.connected) {
    for (let p = 0; p < count; p++) {
      const amount = keep(p);
      if (amount < 1) fade(p, amount);
    }
    return;
  }

  // Flood fill from the border through background pixels. Pixels in the soft
  // band are faded where the fill reaches them but don't spread it, so it
  // can't leak along a gradient into the subject.
  const seen = new Uint8Array(count);
  const stack: number[] = [];
  const visit = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    const amount = keep(p);
    if (amount === 1) return;
    fade(p, amount);
    if (amount === 0) stack.push(p);
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < count - width) visit(p + width);
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
