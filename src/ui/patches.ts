/**
 * Every tool and operation is a patch of a color-calibration chart: the home
 * page lays the tools out as that chart, and each step shows the same patch
 * in the workspace and in the "Add a step" menu. The colors are the published
 * sRGB values of the standard 24-patch reference chart, so they stay the same
 * in both themes, like a printed chart would. Each one was picked so that its
 * label (`ink`) has at least 4.5:1 contrast on it. Keyed by icon.
 *
 * The neutral patches (the chart's grey row) are for what isn't a tool: the
 * input, the output and the user's own recipes.
 */

export interface Patch {
  /** The patch color. */
  color: string;
  /** Text and icons on it: white on dark patches, ink on light ones. */
  ink: 'light' | 'dark';
}

const patch = (color: string, ink: Patch['ink']): Patch => ({ color, ink });

const PATCHES: Record<string, Patch> = {
  margin: patch('#c29682', 'dark'), // light skin
  adjust: patch('#d67e2c', 'dark'), // orange
  compress: patch('#9dbc40', 'dark'), // yellow green
  convert: patch('#505ba6', 'light'), // purplish blue
  vector: patch('#af363c', 'light'), // red
  ocr: patch('#383d96', 'light'), // blue
  merge: patch('#5e3c6c', 'light'), // purple
  scissors: patch('#576c43', 'light'), // foliage
  resize: patch('#67bdaa', 'dark'), // bluish green
  crop: patch('#67bdaa', 'dark'),
  scale: patch('#8580b1', 'dark'), // blue flower
  strip: patch('#735244', 'light'), // dark skin
  upscale: patch('#e0a32e', 'dark'), // orange yellow
};

/** The grey row. */
export const NEUTRAL = {
  input: patch('#a0a0a0', 'dark'), // neutral 6.5
  recipe: patch('#555555', 'light'), // neutral 3.5
  output: patch('#343434', 'light'), // black
} as const;

export function patchOf(icon: string): Patch {
  return PATCHES[icon] ?? NEUTRAL.recipe;
}
