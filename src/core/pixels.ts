/**
 * Pure operations on RGBA pixel buffers (`ImageData`-shaped, straight alpha).
 * They run inside the engine worker on full-size images and on the small
 * preview copies, so preview and export always match, in every browser.
 */

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rrggbb` / `#rgb` (white when unparsable). */
export function hexToRgb(hex: string): Rgb {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  const value = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(value)) return { r: 255, g: 255, b: 255 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Whether any pixel is not fully opaque. */
export function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

// --- adjustments -------------------------------------------------------------

export interface Adjustments {
  /** Percent, 100 = unchanged. */
  brightness: number;
  /** Percent, 100 = unchanged. */
  contrast: number;
  /** Percent, 100 = unchanged. */
  saturation: number;
  /** Percent, 0 = unchanged. */
  grayscale: number;
  /** Percent, 0 = unchanged. */
  sepia: number;
  invert: boolean;
}

/** 3×3 color matrix, row-major. */
type Matrix = readonly number[];

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function multiply(a: Matrix, b: Matrix): Matrix {
  const out: number[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      out.push(a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]);
  return out;
}

/** The Filter Effects spec's `saturate(s)` matrix. */
function saturateMatrix(s: number): Matrix {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ]; // prettier-ignore
}

/** The spec's `grayscale(amount)` matrix. */
function grayscaleMatrix(amount: number): Matrix {
  const k = 1 - amount;
  return [
    0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
  ]; // prettier-ignore
}

/** The spec's `sepia(amount)` matrix. */
function sepiaMatrix(amount: number): Matrix {
  const k = 1 - amount;
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
  ]; // prettier-ignore
}

/** Whether the adjustments leave every pixel unchanged. */
export function isNeutral(a: Adjustments): boolean {
  return (
    a.brightness === 100 &&
    a.contrast === 100 &&
    a.saturation === 100 &&
    a.grayscale === 0 &&
    a.sepia === 0 &&
    !a.invert
  );
}

/**
 * Apply brightness → contrast → saturation/grayscale/sepia → invert, the CSS
 * `filter` order, in place. Per-channel steps use a lookup table.
 */
export function adjustPixels(data: Uint8ClampedArray, a: Adjustments): void {
  if (isNeutral(a)) return;
  const brightness = a.brightness / 100;
  const contrast = a.contrast / 100;
  const before = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const bright = Math.min(255, v * brightness);
    before[v] = bright * contrast + 127.5 * (1 - contrast);
  }

  let matrix = IDENTITY;
  if (a.saturation !== 100) matrix = multiply(saturateMatrix(a.saturation / 100), matrix);
  if (a.grayscale > 0) matrix = multiply(grayscaleMatrix(Math.min(1, a.grayscale / 100)), matrix);
  if (a.sepia > 0) matrix = multiply(sepiaMatrix(Math.min(1, a.sepia / 100)), matrix);
  const mixes = matrix !== IDENTITY;
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix;

  for (let i = 0; i < data.length; i += 4) {
    let r = before[data[i]];
    let g = before[data[i + 1]];
    let b = before[data[i + 2]];
    if (mixes) {
      const nr = m0 * r + m1 * g + m2 * b;
      const ng = m3 * r + m4 * g + m5 * b;
      const nb = m6 * r + m7 * g + m8 * b;
      r = nr;
      g = ng;
      b = nb;
    }
    if (a.invert) {
      r = 255 - Math.min(255, Math.max(0, r));
      g = 255 - Math.min(255, Math.max(0, g));
      b = 255 - Math.min(255, Math.max(0, b));
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/**
 * Approximate Gaussian blur of `radius` pixels (three box blurs), computed on
 * premultiplied colors so transparent pixels don't bleed dark fringes.
 */
export function blurPixels(image: Pixels, radius: number): void {
  const r = Math.round(radius);
  if (r < 1) return;
  const { data, width, height } = image;
  const n = width * height;
  const channels = [
    new Float32Array(n),
    new Float32Array(n),
    new Float32Array(n),
    new Float32Array(n),
  ];
  for (let p = 0; p < n; p++) {
    const alpha = data[p * 4 + 3] / 255;
    channels[0][p] = data[p * 4] * alpha;
    channels[1][p] = data[p * 4 + 1] * alpha;
    channels[2][p] = data[p * 4 + 2] * alpha;
    channels[3][p] = data[p * 4 + 3];
  }
  // Three passes of a box this wide approximate a Gaussian with sigma ≈ radius / 2.
  const box = Math.max(1, Math.round(r / 2));
  const scratch = new Float32Array(n);
  for (const channel of channels) {
    for (let pass = 0; pass < 3; pass++) {
      boxBlurLine(channel, scratch, width, height, box, true);
      boxBlurLine(scratch, channel, width, height, box, false);
    }
  }
  for (let p = 0; p < n; p++) {
    const alpha = channels[3][p];
    const scale = alpha > 0 ? 255 / alpha : 0;
    data[p * 4] = channels[0][p] * scale;
    data[p * 4 + 1] = channels[1][p] * scale;
    data[p * 4 + 2] = channels[2][p] * scale;
    data[p * 4 + 3] = alpha;
  }
}

/** One box-blur pass along rows (`horizontal`) or columns, clamping at the edges. */
function boxBlurLine(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  r: number,
  horizontal: boolean,
): void {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const scale = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width : line;
    const at = (i: number) => src[base + Math.min(length - 1, Math.max(0, i)) * stride];
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += at(i);
    for (let i = 0; i < length; i++) {
      dst[base + i * stride] = sum * scale;
      sum += at(i + r + 1) - at(i - r);
    }
  }
}

/** 3×3 unsharp-style sharpen; returns a new buffer. `amount` is 0..1. */
export function sharpenPixels(image: Pixels, amount: number): Uint8ClampedArray<ArrayBuffer> {
  const { data: src, width, height } = image;
  const out = new Uint8ClampedArray(src.length);
  const center = 1 + 4 * amount;
  const at = (x: number, y: number) =>
    (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const up = at(x, y - 1);
      const down = at(x, y + 1);
      const left = at(x - 1, y);
      const right = at(x + 1, y);
      for (let c = 0; c < 3; c++) {
        out[i + c] =
          src[i + c] * center -
          amount * (src[up + c] + src[down + c] + src[left + c] + src[right + c]);
      }
      out[i + 3] = src[i + 3];
    }
  }
  return out;
}

// --- background keying ---------------------------------------------------------

export interface KeyOptions {
  color: string;
  /** 0–100: distance below which a pixel becomes fully transparent. */
  tolerance: number;
  /** 0–100: band beyond the tolerance that fades out gradually. */
  smoothing: number;
}

/** Longest distance in RGB space (black ↔ white). */
const MAX_DISTANCE = Math.hypot(255, 255, 255);

/** Turn pixels close to the key color transparent, in place. */
export function keyColor(data: Uint8ClampedArray, options: KeyOptions): void {
  const key = hexToRgb(options.color);
  const limit = (Math.max(0, Math.min(100, options.tolerance)) / 100) * MAX_DISTANCE;
  const band = (Math.max(0, Math.min(100, options.smoothing)) / 100) * 180;
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.hypot(data[i] - key.r, data[i + 1] - key.g, data[i + 2] - key.b);
    if (distance <= limit) data[i + 3] = 0;
    else if (band > 0 && distance <= limit + band) {
      data[i + 3] = Math.round(data[i + 3] * ((distance - limit) / band));
    }
  }
}

// --- filters used to prepare images for vector tracing -------------------------

/** Per-channel rank filter over a `size`×`size` window, used by mode and median. */
function windowFilter(
  image: Pixels,
  size: number,
  pick: (values: Uint8Array, count: number, original: number) => number,
): Uint8ClampedArray<ArrayBuffer> {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(data.length);
  const half = Math.floor(size / 2);
  const values = new Uint8Array(size * size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let count = 0;
        for (let dy = -half; dy <= half; dy++) {
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -half; dx <= half; dx++) {
            const xx = Math.min(width - 1, Math.max(0, x + dx));
            values[count++] = data[(yy * width + xx) * 4 + c];
          }
        }
        out[i + c] = pick(values, count, data[i + c]);
      }
      out[i + 3] = data[i + 3];
    }
  }
  return out;
}

/**
 * Snap each channel to its most frequent value in the window (like Pillow's
 * ModeFilter): flattens anti-aliasing into clean regions before tracing.
 */
export function modeFilter(image: Pixels, size = 5): Uint8ClampedArray<ArrayBuffer> {
  const counts = new Uint8Array(256);
  return windowFilter(image, size, (values, count, original) => {
    let best = original;
    let bestCount = 2; // a value must appear at least 3 times to win
    for (let k = 0; k < count; k++) {
      const n = ++counts[values[k]];
      if (n > bestCount) {
        bestCount = n;
        best = values[k];
      }
    }
    for (let k = 0; k < count; k++) counts[values[k]] = 0;
    return best;
  });
}

/** Per-channel median: removes sensor noise and JPEG speckles before tracing photos. */
export function medianFilter(image: Pixels, size = 3): Uint8ClampedArray<ArrayBuffer> {
  return windowFilter(image, size, (values, count) => {
    const window = values.subarray(0, count).sort();
    return window[count >> 1];
  });
}

/** Count of each distinct opaque RGB color, or `null` when there are more than `limit`. */
export function countColors(data: Uint8ClampedArray, limit: number): Map<number, number> | null {
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (counts.size > limit) return null;
  }
  return counts;
}

/**
 * Flat art (logo, illustration) vs photo: its few most common colors cover most
 * of the (small) image. Anti-aliasing adds many rare colors, so the bar is
 * well below 100%.
 */
export function isFlatArt(data: Uint8ClampedArray, topColors = 12, coverage = 0.85): boolean {
  const counts = countColors(data, 4096);
  if (!counts) return false;
  const sorted = [...counts.values()].sort((a, b) => b - a);
  const total = sorted.reduce((sum, n) => sum + n, 0);
  const top = sorted.slice(0, topColors).reduce((sum, n) => sum + n, 0);
  return total > 0 && top / total >= coverage;
}

/** Reduce to at most `colors` colors with median cut (no dithering), in place. */
export function quantize(data: Uint8ClampedArray, colors: number): void {
  const counts = countColors(data, Number.POSITIVE_INFINITY)!;
  const entries = [...counts.entries()].map(([key, count]) => ({
    rgb: [(key >> 16) & 255, (key >> 8) & 255, key & 255],
    count,
  }));
  type Entry = (typeof entries)[number];

  const range = (box: Entry[], c: number) => {
    let min = 255;
    let max = 0;
    for (const e of box) {
      min = Math.min(min, e.rgb[c]);
      max = Math.max(max, e.rgb[c]);
    }
    return max - min;
  };

  const boxes: Entry[][] = [entries];
  while (boxes.length < colors) {
    // Split the box with the widest channel range at its pixel-weighted median.
    let target = -1;
    let channel = 0;
    let widest = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        const r = range(box, c);
        if (r > widest) [widest, target, channel] = [r, index, c];
      }
    });
    if (target === -1) break;
    const box = boxes[target].sort((a, b) => a.rgb[channel] - b.rgb[channel]);
    const half = box.reduce((sum, e) => sum + e.count, 0) / 2;
    let acc = 0;
    let cut = 1;
    for (; cut < box.length; cut++) {
      acc += box[cut - 1].count;
      if (acc >= half) break;
    }
    // A dominant color (e.g. a white background) can put the median on the
    // last entry; both halves must keep at least one color.
    cut = Math.min(cut, box.length - 1);
    boxes.splice(target, 1, box.slice(0, cut), box.slice(cut));
  }

  const palette = boxes.map((box) => {
    const total = box.reduce((sum, e) => sum + e.count, 0);
    return [0, 1, 2].map((c) =>
      Math.round(box.reduce((s, e) => s + e.rgb[c] * e.count, 0) / total),
    );
  });
  const nearest = new Map<number, number[]>();
  for (const key of counts.keys()) {
    const rgb = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
    let best = palette[0];
    let bestDistance = Infinity;
    for (const color of palette) {
      const d = (color[0] - rgb[0]) ** 2 + (color[1] - rgb[1]) ** 2 + (color[2] - rgb[2]) ** 2;
      if (d < bestDistance) [bestDistance, best] = [d, color];
    }
    nearest.set(key, best);
  }
  for (let i = 0; i < data.length; i += 4) {
    const color = nearest.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])!;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
  }
}
