/**
 * Pure image geometry: sizes, orientation, crop boxes, merge layouts and
 * margins. Shared by the operations (full-size export and downscaled preview)
 * and the crop editor.
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

export function isCrop(value: unknown): value is Crop {
  if (typeof value !== 'object' || value === null) return false;
  const { x, y, width, height } = value as Record<string, unknown>;
  const fraction = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;
  return (
    fraction(x) &&
    fraction(y) &&
    fraction(width) &&
    fraction(height) &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 + 1e-9 &&
    y + height <= 1 + 1e-9
  );
}

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

export type MergeDirection = 'horizontal' | 'vertical';
/** Placement along the cross axis: left/center/right (vertical) or top/middle/bottom. */
export type MergeAlignment = 'start' | 'center' | 'end';
/** `fill` scales each image so its cross-axis side matches the largest one. */
export type MergeResize = 'none' | 'fill';

export interface MergeLayoutOptions {
  direction: MergeDirection;
  alignment: MergeAlignment;
  resize: MergeResize;
  /** Space between images, in pixels. */
  gap: number;
}

export interface MergeLayout extends Size {
  placements: Rect[];
}

/** The combined canvas size and each image's draw rectangle (whole pixels). */
export function mergeLayout(sizes: readonly Size[], options: MergeLayoutOptions): MergeLayout {
  if (sizes.length === 0) return { width: 0, height: 0, placements: [] };

  const horizontal = options.direction === 'horizontal';
  const crossOf = (s: Size) => (horizontal ? s.height : s.width);
  const mainOf = (s: Size) => (horizontal ? s.width : s.height);
  const targetCross = Math.max(...sizes.map(crossOf));
  const gap = Math.max(0, Math.round(options.gap));

  const drawn = sizes.map((s) => {
    const scale = options.resize === 'fill' && crossOf(s) > 0 ? targetCross / crossOf(s) : 1;
    return roundSize({ width: s.width * scale, height: s.height * scale });
  });

  const canvasCross = Math.max(...drawn.map(crossOf));
  const canvasMain = drawn.reduce((sum, s) => sum + mainOf(s), 0) + gap * (drawn.length - 1);

  let cursor = 0;
  const placements = drawn.map((size) => {
    const free = canvasCross - crossOf(size);
    const offset =
      options.alignment === 'start'
        ? 0
        : options.alignment === 'center'
          ? Math.round(free / 2)
          : free;
    const place = {
      x: horizontal ? cursor : offset,
      y: horizontal ? offset : cursor,
      width: size.width,
      height: size.height,
    };
    cursor += mainOf(size) + gap;
    return place;
  });

  return {
    width: horizontal ? canvasMain : canvasCross,
    height: horizontal ? canvasCross : canvasMain,
    placements,
  };
}

// --- margins ---------------------------------------------------------------

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Each side's thickness in whole pixels. In `percent` mode the value is a
 * percentage of the image's shorter side, so margins stay proportional across
 * differently sized images in a batch.
 */
export function marginPixels(sides: Sides, unit: 'px' | 'percent', size: Size): Sides {
  const base = Math.min(size.width, size.height);
  const toPx = (value: number) =>
    Math.max(0, Math.round(unit === 'percent' ? (base * value) / 100 : value));
  return {
    top: toPx(sides.top),
    right: toPx(sides.right),
    bottom: toPx(sides.bottom),
    left: toPx(sides.left),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
