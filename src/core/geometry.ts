/**
 * Pure image geometry: sizes, orientation, crop boxes, merge layouts and
 * margins. Shared by the operations (full-size processing and downscaled
 * preview) and the crop editor.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Round a size to whole pixels, at least 1×1. */
export function roundSize(size: Size): Size {
  return {
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
}

/** Scale `size` to fit inside `box`, keeping the aspect ratio; never enlarges unless `enlarge`. */
export function fitInside(size: Size, box: Size, enlarge = false): Size {
  const factor = Math.min(box.width / size.width, box.height / size.height);
  const scale = enlarge ? factor : Math.min(1, factor);
  return roundSize({ width: size.width * scale, height: size.height * scale });
}

/** Factor that brings the longest side of `size` down to `maxSide` (1 when already smaller). */
export function downscaleFactor(size: Size, maxSide: number): number {
  return Math.min(1, maxSide / Math.max(size.width, size.height));
}

// --- orientation & crop ----------------------------------------------------

export type Rotation = 0 | 90 | 180 | 270;

/** Size of an image after rotation (90°/270° swap the axes). */
export function orientedSize(size: Size, rotate: Rotation): Size {
  return rotate === 90 || rotate === 270 ? { width: size.height, height: size.width } : size;
}

/** A crop region as fractions (0..1) of the oriented image, so it fits any image size. */
export type Crop = Rect;

export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

export type AspectPreset = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9';
export type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Smallest crop side, as a fraction of the image. */
const MIN_CROP = 0.05;

/**
 * Fraction-space height/width factor `k` that gives the preset's pixel aspect
 * ratio on an image of size `oriented` (`null` for a free crop).
 */
export function aspectFactor(preset: AspectPreset, oriented: Size): number | null {
  if (preset === 'free') return null;
  const [rw, rh] =
    preset === 'original' ? [oriented.width, oriented.height] : preset.split(':').map(Number);
  return (oriented.width / oriented.height) * (rh / rw);
}

/** Largest centered crop with height factor `k` (see {@link aspectFactor}). */
export function centeredCrop(k: number | null): Crop {
  if (k === null) return FULL_CROP;
  const width = k <= 1 ? 1 : 1 / k;
  const height = k <= 1 ? k : 1;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

/**
 * Apply a pointer drag of (`dx`, `dy`) — fractions of the image — to the crop.
 * `mode` is the dragged handle (compass edge/corner) or `move`; `k` locks the
 * aspect ratio, `null` leaves it free.
 */
export function applyDrag(
  crop: Crop,
  mode: DragMode,
  dx: number,
  dy: number,
  k: number | null,
): Crop {
  if (mode === 'move') {
    return {
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height),
    };
  }

  let { x, y, width, height } = crop;
  const right = x + width;
  const bottom = y + height;
  const east = mode.includes('e');
  const west = mode.includes('w');
  const south = mode.includes('s');
  const north = mode.includes('n');

  if (east) width = clamp(width + dx, 0, 1);
  if (west) {
    x = clamp(Math.min(right - MIN_CROP, x + dx), 0, 1);
    width = right - x;
  }
  if (south) height = clamp(height + dy, 0, 1);
  if (north) {
    y = clamp(Math.min(bottom - MIN_CROP, y + dy), 0, 1);
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
    x = clamp(Math.min(x, 1 - width), 0, 1);
    y = clamp(Math.min(y, 1 - height), 0, 1);
  }

  return { x, y, width, height };
}

/** The crop in whole pixels of an image of size `size`, at least 1×1 and inside it. */
export function cropPixels(crop: Crop, size: Size): Rect {
  const x = clamp(Math.round(crop.x * size.width), 0, size.width - 1);
  const y = clamp(Math.round(crop.y * size.height), 0, size.height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(crop.width * size.width), 1, size.width - x),
    height: clamp(Math.round(crop.height * size.height), 1, size.height - y),
  };
}

// --- merge -----------------------------------------------------------------

export interface MergeOptions {
  direction: 'vertical' | 'horizontal';
  /** Placement across the direction: left/top, center, or right/bottom. */
  align: 'start' | 'center' | 'end';
  /** Scale each image to the widest (stacked) or tallest (side by side) one. */
  match: boolean;
  /** Space between images, in pixels. */
  gap: number;
}

export interface MergeLayout extends Size {
  /** Where each image is drawn, in whole pixels. */
  places: Rect[];
}

export function mergeLayout(sizes: readonly Size[], options: MergeOptions): MergeLayout {
  const vertical = options.direction === 'vertical';
  const across = (s: Size) => (vertical ? s.width : s.height);
  const along = (s: Size) => (vertical ? s.height : s.width);
  const target = Math.max(...sizes.map(across));
  const drawn = sizes.map((s) =>
    options.match
      ? roundSize({
          width: (s.width * target) / across(s),
          height: (s.height * target) / across(s),
        })
      : s,
  );
  const thickness = Math.max(...drawn.map(across));
  const gap = Math.max(0, Math.round(options.gap));

  let cursor = 0;
  const places = drawn.map((s) => {
    const free = thickness - across(s);
    const offset =
      options.align === 'start' ? 0 : options.align === 'center' ? Math.round(free / 2) : free;
    const place = vertical
      ? { x: offset, y: cursor, width: s.width, height: s.height }
      : { x: cursor, y: offset, width: s.width, height: s.height };
    cursor += along(s) + gap;
    return place;
  });
  const length = Math.max(1, cursor - gap);
  return vertical
    ? { width: thickness, height: length, places }
    : { width: length, height: thickness, places };
}

// --- margins ---------------------------------------------------------------

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Each side in whole pixels. In percent, sides are a percentage of the
 * image's shorter side, so margins stay proportional across a batch.
 */
export function marginPixels(sides: Sides, unit: 'px' | 'percent', size: Size): Sides {
  const base = Math.min(size.width, size.height);
  const px = (value: number) =>
    Math.max(0, Math.round(unit === 'percent' ? (base * value) / 100 : value));
  return {
    top: px(sides.top),
    right: px(sides.right),
    bottom: px(sides.bottom),
    left: px(sides.left),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
