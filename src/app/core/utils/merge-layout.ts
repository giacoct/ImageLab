/**
 * Pure geometry for the merge tool: given the natural sizes of the images and
 * the chosen options, work out the combined canvas size and where each image
 * is drawn. Kept free of the DOM so it can be unit-tested and shared by both
 * the export pass and the live preview.
 */

/** Stack images side by side (`horizontal`) or top to bottom (`vertical`). */
export type MergeDirection = 'horizontal' | 'vertical';

/**
 * Where each image sits along the *cross* axis (the one that isn't the stack
 * direction): for a vertical stack this is left/centre/right, for a horizontal
 * stack it's top/middle/bottom.
 */
export type MergeAlignment = 'start' | 'center' | 'end';

/** `none` keeps every image at its natural size; `fill` scales each one so its
 *  cross-axis dimension matches the others (fill width / fill height). */
export type MergeResize = 'none' | 'fill';

export interface MergeLayoutOptions {
  direction: MergeDirection;
  alignment: MergeAlignment;
  resize: MergeResize;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MergeLayout {
  width: number;
  height: number;
  placements: Placement[];
}

/**
 * Compute the combined canvas size and each image's draw rectangle. Sizes are
 * rounded to whole pixels. An empty input yields a 0×0 layout.
 */
export function computeMergeLayout(
  sizes: readonly Size[],
  options: MergeLayoutOptions,
): MergeLayout {
  if (sizes.length === 0) {
    return { width: 0, height: 0, placements: [] };
  }

  const horizontal = options.direction === 'horizontal';
  // The cross axis is the one perpendicular to the stack direction.
  const crossOf = (s: Size) => (horizontal ? s.height : s.width);

  // "Fill" scales each image so its cross dimension equals the largest cross
  // dimension in the set; "none" leaves images untouched.
  const targetCross = Math.max(...sizes.map(crossOf));

  const drawn: Size[] = sizes.map((s) => {
    if (options.resize !== 'fill') {
      return { width: Math.round(s.width), height: Math.round(s.height) };
    }
    const cross = crossOf(s);
    const scale = cross > 0 ? targetCross / cross : 1;
    return {
      width: Math.max(1, Math.round(s.width * scale)),
      height: Math.max(1, Math.round(s.height * scale)),
    };
  });

  const canvasCross =
    options.resize === 'fill' ? targetCross : Math.max(...drawn.map(crossOf));
  const canvasMain = drawn.reduce(
    (sum, s) => sum + (horizontal ? s.width : s.height),
    0,
  );

  const placements: Placement[] = [];
  let cursor = 0;
  for (const size of drawn) {
    const extent = crossOf(size);
    const free = canvasCross - extent;
    const offset =
      options.alignment === 'start'
        ? 0
        : options.alignment === 'center'
          ? Math.round(free / 2)
          : free;

    placements.push({
      x: horizontal ? cursor : offset,
      y: horizontal ? offset : cursor,
      width: size.width,
      height: size.height,
    });
    cursor += horizontal ? size.width : size.height;
  }

  return {
    width: horizontal ? canvasMain : canvasCross,
    height: horizontal ? canvasCross : canvasMain,
    placements,
  };
}
