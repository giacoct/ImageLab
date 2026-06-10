/**
 * Pure pixel-buffer operations shared by the export pipeline (run inside the
 * pixel Web Worker) and the live previews (run synchronously on small,
 * downscaled snapshots where the cost is negligible).
 */

export interface BackgroundKeyOptions {
  color: string;
  tolerance: number;
  edgeSmoothing: number;
}

/**
 * Key out a background color by turning matching pixels transparent, mutating
 * the RGBA buffer in place.
 */
export function keyBackgroundPixels(
  data: Uint8ClampedArray,
  options: BackgroundKeyOptions,
): void {
  const key = hexToRgb(options.color);
  const transparentLimit = (Math.max(0, Math.min(100, options.tolerance)) / 100) * 441.672;
  const smoothingRange = (Math.max(0, Math.min(100, options.edgeSmoothing)) / 100) * 180;

  for (let index = 0; index < data.length; index += 4) {
    const distance = colorDistance(data[index], data[index + 1], data[index + 2], key);

    if (distance <= transparentLimit) {
      data[index + 3] = 0;
      continue;
    }

    if (smoothingRange > 0 && distance <= transparentLimit + smoothingRange) {
      const alphaScale = (distance - transparentLimit) / smoothingRange;
      data[index + 3] = Math.round(data[index + 3] * alphaScale);
    }
  }
}

/**
 * Unsharp-mask style 3×3 sharpen. Returns a new buffer; the source is left
 * untouched. `amount` is 0..1.
 */
export function sharpenPixels(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length);
  const center = 1 + 4 * amount;

  const sampleAt = (x: number, y: number): number =>
    (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const up = sampleAt(x, y - 1);
      const down = sampleAt(x, y + 1);
      const left = sampleAt(x - 1, y);
      const right = sampleAt(x + 1, y);

      for (let channel = 0; channel < 3; channel++) {
        const value =
          src[index + channel] * center -
          amount *
            (src[up + channel] + src[down + channel] + src[left + channel] + src[right + channel]);
        out[index + channel] = value < 0 ? 0 : value > 255 ? 255 : value;
      }

      out[index + 3] = src[index + 3];
    }
  }

  return out;
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(
    normalized.length === 3 ? expandShortHex(normalized) : normalized,
    16,
  );

  if (Number.isNaN(value)) {
    return { red: 255, green: 255, blue: 255 };
  }

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function expandShortHex(hex: string): string {
  return hex
    .split('')
    .map((value) => `${value}${value}`)
    .join('');
}

function colorDistance(
  red: number,
  green: number,
  blue: number,
  key: { red: number; green: number; blue: number },
): number {
  return Math.hypot(red - key.red, green - key.green, blue - key.blue);
}
