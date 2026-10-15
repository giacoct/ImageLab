/**
 * Pure geometry for the Resize tool: orientation (rotate/flip), crop presets,
 * and dragging the crop box. Crops are expressed as fractions (0..1) of the
 * rotated/flipped image so they don't depend on the preview's display size.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface Orientation {
  rotateDegrees: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export const NO_ROTATION: Orientation = {
  rotateDegrees: 0,
  flipHorizontal: false,
  flipVertical: false,
};

/** A crop region expressed as fractions (0..1) of the oriented image. */
export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AspectPreset = 'free' | 'original' | '1:1' | '4:3' | '16:9';
export type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const FULL_CROP: NormalizedCrop = { x: 0, y: 0, width: 1, height: 1 };

/** Smallest crop side, as a fraction of the image. */
const MIN_CROP = 0.05;

/** Size of an image after rotation (90°/270° swap the axes). */
export function orientedSize(
  size: { width: number; height: number },
  rotateDegrees: Rotation,
): { width: number; height: number } {
  return rotateDegrees === 90 || rotateDegrees === 270
    ? { width: size.height, height: size.width }
    : size;
}

/** Fraction-space height/width factor that preserves a pixel aspect ratio. */
export function ratioFactor(
  preset: AspectPreset,
  oriented: { width: number; height: number },
): number {
  const [rw, rh] =
    preset === '1:1'
      ? [1, 1]
      : preset === '4:3'
        ? [4, 3]
        : preset === '16:9'
          ? [16, 9]
          : [oriented.width, oriented.height];
  // hFrac = wFrac * (tW / tH) / (rw / rh)
  return (oriented.width / oriented.height) * (rh / rw);
}

/** Largest centered crop with the given fraction-space height factor `k`. */
export function centeredCrop(k: number): NormalizedCrop {
  const width = k <= 1 ? 1 : 1 / k;
  const height = k <= 1 ? k : 1;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

/**
 * Apply a pointer drag of (`dx`, `dy`) — fractions of the image — to the crop.
 * `mode` is the dragged handle (compass edge/corner) or `move`; `k` locks the
 * aspect ratio (see {@link ratioFactor}), `null` leaves it free.
 */
export function applyDrag(
  crop: NormalizedCrop,
  mode: DragMode,
  dx: number,
  dy: number,
  k: number | null,
): NormalizedCrop {
  if (mode === 'move') {
    return {
      ...crop,
      x: Math.max(0, Math.min(1 - crop.width, crop.x + dx)),
      y: Math.max(0, Math.min(1 - crop.height, crop.y + dy)),
    };
  }

  let { x, y, width, height } = crop;
  const right = x + width;
  const bottom = y + height;
  const east = mode.includes('e');
  const west = mode.includes('w');
  const south = mode.includes('s');
  const north = mode.includes('n');

  if (east) width = clamp01(width + dx);
  if (west) {
    x = clamp01(Math.min(right - MIN_CROP, x + dx));
    width = right - x;
  }
  if (south) height = clamp01(height + dy);
  if (north) {
    y = clamp01(Math.min(bottom - MIN_CROP, y + dy));
    height = bottom - y;
  }

  width = Math.max(MIN_CROP, Math.min(width, 1 - x));
  height = Math.max(MIN_CROP, Math.min(height, 1 - y));

  if (k !== null) {
    // Keep the ratio by deriving height from width, anchored at the fixed corner.
    height = Math.min(width * k, 1);
    width = height / k;
    if (north) y = bottom - height;
    if (west) x = right - width;
    x = clamp01(Math.min(x, 1 - width));
    y = clamp01(Math.min(y, 1 - height));
  }

  return { x, y, width, height };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
