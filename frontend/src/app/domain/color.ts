/** An RGB color with 0–255 channels. */
export interface Rgb {
  red: number;
  green: number;
  blue: number;
}

/** Parse a `#rgb` or `#rrggbb` color into its channels (white when unparsable). */
export function hexToRgb(hex: string): Rgb {
  const digits = hex.replace('#', '');
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return { red: 255, green: 255, blue: 255 };
  }
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}
