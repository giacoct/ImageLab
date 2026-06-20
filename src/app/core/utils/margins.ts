/**
 * Pure geometry + drawing for the margin tool: turn the chosen per-side
 * thicknesses (in px or %) into pixel sizes, build the matching fill style, and
 * paint the margin bands. Kept free of tool/DOM state so it can be shared by
 * both the export pass and the live preview, which keeps them identical.
 */

/** Thickness is given either as raw pixels or as a percentage of the image. */
export type MarginUnit = 'px' | 'percent';

export interface MarginSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Resolve each side's thickness to whole pixels. In `percent` mode the value is
 * a percentage of the image's shorter side, so the margin stays proportionally
 * consistent across differently sized images in a batch.
 */
export function resolveMarginSides(
  sides: MarginSides,
  unit: MarginUnit,
  imageWidth: number,
  imageHeight: number,
): MarginSides {
  const base = Math.min(imageWidth, imageHeight);
  const toPx = (value: number) =>
    Math.max(0, Math.round(unit === 'percent' ? (base * value) / 100 : value));
  return {
    top: toPx(sides.top),
    right: toPx(sides.right),
    bottom: toPx(sides.bottom),
    left: toPx(sides.left),
  };
}

/** Build a canvas fill style from a hex color and an opacity percentage (0–100). */
export function marginFillStyle(color: string, opacityPercent: number): string {
  const { red, green, blue } = hexToRgb(color);
  const alpha = Math.max(0, Math.min(1, opacityPercent / 100));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Paint the four margin bands around an image that has already been drawn at
 * `(left, top)`. Only the surrounding border area is filled, so a
 * semi-transparent margin never tints the image itself.
 */
export function paintMarginBands(
  context: CanvasRenderingContext2D,
  totalWidth: number,
  totalHeight: number,
  px: MarginSides,
  fillStyle: string,
): void {
  if (px.top <= 0 && px.right <= 0 && px.bottom <= 0 && px.left <= 0) {
    return;
  }

  context.save();
  context.fillStyle = fillStyle;
  // Top and bottom bands span the full width; the side bands fill the gap left
  // between them so the corners are covered exactly once.
  const innerHeight = Math.max(0, totalHeight - px.top - px.bottom);
  if (px.top > 0) context.fillRect(0, 0, totalWidth, px.top);
  if (px.bottom > 0) context.fillRect(0, totalHeight - px.bottom, totalWidth, px.bottom);
  if (px.left > 0) context.fillRect(0, px.top, px.left, innerHeight);
  if (px.right > 0) context.fillRect(totalWidth - px.right, px.top, px.right, innerHeight);
  context.restore();
}

/** Parse a `#rgb` or `#rrggbb` color into its channels (white on failure). */
function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((channel) => channel + channel)
          .join('')
      : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return { red: 255, green: 255, blue: 255 };
  }
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}
