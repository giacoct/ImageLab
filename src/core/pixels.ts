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
export type Matrix = readonly number[];

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function multiply(a: Matrix, b: Matrix): Matrix {
  const out: number[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      out.push(
        a[row * 3] * b[col] +
          a[row * 3 + 1] * b[3 + col] +
          a[row * 3 + 2] * b[6 + col],
      );
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
function isNeutral(a: Adjustments): boolean {
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
 * Saturation, grayscale and sepia as one color matrix (row-major), or null
 * when they leave colors alone.
 */
export function colorMatrix(a: Adjustments): Matrix | null {
  let matrix = IDENTITY;
  if (a.saturation !== 100)
    matrix = multiply(saturateMatrix(a.saturation / 100), matrix);
  if (a.grayscale > 0)
    matrix = multiply(grayscaleMatrix(Math.min(1, a.grayscale / 100)), matrix);
  if (a.sepia > 0)
    matrix = multiply(sepiaMatrix(Math.min(1, a.sepia / 100)), matrix);
  return matrix === IDENTITY ? null : matrix;
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

  const matrix = colorMatrix(a);
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix ?? IDENTITY;

  for (let i = 0; i < data.length; i += 4) {
    let r = before[data[i]];
    let g = before[data[i + 1]];
    let b = before[data[i + 2]];
    if (matrix) {
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
 * A blur of `radius` pixels is three box blurs of this radius each way
 * (sigma ≈ radius / 2), or none (0) below one pixel.
 */
export function blurBox(radius: number): number {
  const r = Math.round(radius);
  return r < 1 ? 0 : Math.max(1, Math.round(r / 2));
}

/**
 * Approximate Gaussian blur of `radius` pixels (three box blurs), computed on
 * premultiplied colors so transparent pixels don't bleed dark fringes.
 */
export function blurPixels(image: Pixels, radius: number): void {
  const box = blurBox(radius);
  if (box === 0) return;
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
    const at = (i: number) =>
      src[base + Math.min(length - 1, Math.max(0, i)) * stride];
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += at(i);
    for (let i = 0; i < length; i++) {
      dst[base + i * stride] = sum * scale;
      sum += at(i + r + 1) - at(i - r);
    }
  }
}

/** 3×3 unsharp-style sharpen; returns a new buffer. `amount` is 0..1. */
export function sharpenPixels(
  image: Pixels,
  amount: number,
): Uint8ClampedArray<ArrayBuffer> {
  const { data: src, width, height } = image;
  const out = new Uint8ClampedArray(src.length);
  const center = 1 + 4 * amount;
  const at = (x: number, y: number) =>
    (Math.max(0, Math.min(height - 1, y)) * width +
      Math.max(0, Math.min(width - 1, x))) *
    4;
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
          amount *
            (src[up + c] + src[down + c] + src[left + c] + src[right + c]);
      }
      out[i + 3] = src[i + 3];
    }
  }
  return out;
}
