/**
 * Each tool and operation has a hue of its own (OKLCH degrees, used by the
 * `.tile` class), keyed by its icon, so a step looks the same on the home
 * page, in the workspace and in the "Add a step" menu. The brand teal (185)
 * is for the input, the output and saved recipes.
 */

const HUES: Record<string, number> = {
  strip: 0,
  vector: 25,
  compress: 50,
  adjust: 80,
  margin: 120,
  scissors: 150,
  resize: 210,
  crop: 210,
  ocr: 232,
  scale: 255,
  merge: 278,
  convert: 302,
  upscale: 330,
};

export const BRAND_HUE = 185;

export function hueOf(icon: string): number {
  return HUES[icon] ?? BRAND_HUE;
}
