/** The Adjust tool's settings that map onto CSS/canvas filter functions. */
export interface FilterAdjustments {
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
  /** Pixels, 0 = unchanged. */
  blur: number;
}

/**
 * Build a CSS filter string from the adjustments. The same string drives the
 * live preview (`style.filter`) and the export (`context.filter`), so they
 * always match.
 */
export function buildFilter(value: FilterAdjustments): string {
  const parts = [
    `brightness(${value.brightness}%)`,
    `contrast(${value.contrast}%)`,
    `saturate(${value.saturation}%)`,
  ];

  if (value.grayscale > 0) parts.push(`grayscale(${value.grayscale}%)`);
  if (value.sepia > 0) parts.push(`sepia(${value.sepia}%)`);
  if (value.invert) parts.push('invert(100%)');
  if (value.blur > 0) parts.push(`blur(${value.blur}px)`);

  return parts.join(' ');
}
