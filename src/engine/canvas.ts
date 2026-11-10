/**
 * OffscreenCanvas helpers. Every operation works on an OffscreenCanvas (the
 * pipeline's image type), so it runs the same in the engine worker and in
 * the browser tests.
 *
 * Canvases are in the working color space: sRGB, or Display P3 for a
 * wide-gamut image (`core/color.ts`), where the browser can (it converts
 * what it draws into the canvas's space). The engine sets it for each
 * request, from the images it works on (`pipeline.ts`); a worker runs one
 * request at a time.
 */

import type { ColorSpace } from "../core/color";
import type { Pixels } from "../core/pixels";

/** The pipeline's image type. */
export type Img = OffscreenCanvas;

/** Whether canvases can hold Display P3 here (not in every browser). */
export const canHoldP3 = (() => {
  try {
    const context = new OffscreenCanvas(1, 1).getContext("2d", {
      colorSpace: "display-p3",
    });
    return context?.getImageData(0, 0, 1, 1).colorSpace === "display-p3";
  } catch {
    return false;
  }
})();

let working: ColorSpace = "srgb";

/** Make the canvases created from now on in this color space (if it can be). */
export function workIn(space: ColorSpace): void {
  working = space === "display-p3" && canHoldP3 ? space : "srgb";
}

export function workingSpace(): ColorSpace {
  return working;
}

export function context2d(
  canvas: OffscreenCanvas,
): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", {
    willReadFrequently: false,
    colorSpace: working,
  });
  if (!context)
    throw new Error("Canvas rendering is not available in this browser.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return context;
}

/** A blank (transparent) canvas of whole-pixel size, at least 1×1. */
export function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(
    Math.max(1, Math.round(width)),
    Math.max(1, Math.round(height)),
  );
}

/** A copy of `source` drawn at `width`×`height` (high-quality smoothing). */
export function resized(
  source: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
): OffscreenCanvas {
  const canvas = createCanvas(width, height);
  context2d(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Downscale in halving steps first: a single big `drawImage` reduction skips
 * pixels and aliases, even with high-quality smoothing in some browsers.
 */
export function downscaled(
  source: OffscreenCanvas | ImageBitmap,
  width: number,
  height: number,
): OffscreenCanvas {
  let current: OffscreenCanvas | ImageBitmap = source;
  while (current.width / 2 >= width && current.height / 2 >= height) {
    current = resized(
      current,
      Math.round(current.width / 2),
      Math.round(current.height / 2),
    );
  }
  return resized(current, width, height);
}

export function readPixels(
  canvas: OffscreenCanvas,
): Pixels & { image: ImageData } {
  const image = context2d(canvas).getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return { image, data: image.data, width: image.width, height: image.height };
}

/** A canvas holding `data` (RGBA, straight alpha, in the working space). */
export function fromPixels(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): OffscreenCanvas {
  const canvas = createCanvas(width, height);
  context2d(canvas).putImageData(blankPixels(width, height, data), 0, 0);
  return canvas;
}

/** An `ImageData` in the working space (else putting it converts it). */
export function blankPixels(
  width: number,
  height: number,
  data?: Uint8ClampedArray<ArrayBuffer>,
): ImageData {
  const settings = { colorSpace: working };
  return data
    ? new ImageData(data, width, height, settings)
    : new ImageData(width, height, settings);
}

/** A copy of the image in sRGB (Display P3 colors beyond it are clipped). */
export function inSrgb(image: OffscreenCanvas): OffscreenCanvas {
  const copy = new OffscreenCanvas(image.width, image.height);
  copy.getContext("2d", { colorSpace: "srgb" })!.drawImage(image, 0, 0);
  return copy;
}

/**
 * `#rrggbb` (an sRGB color, as settings give them) as the numbers it has in
 * the working space, also as `#rrggbb`: what pixels are compared with.
 */
export function inWorkingSpace(hex: string): string {
  if (working === "srgb") return hex;
  const context = context2d(createCanvas(1, 1));
  context.fillStyle = hex;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Modify the canvas's pixels in place through `edit`. */
export function editPixels(
  canvas: OffscreenCanvas,
  edit: (pixels: Pixels) => void,
): OffscreenCanvas {
  const pixels = readPixels(canvas);
  edit(pixels);
  context2d(canvas).putImageData(pixels.image, 0, 0);
  return canvas;
}

/** The image flattened onto white (for formats without transparency). */
export function flattened(canvas: OffscreenCanvas): OffscreenCanvas {
  const out = createCanvas(canvas.width, canvas.height);
  const context = context2d(out);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, out.width, out.height);
  context.drawImage(canvas, 0, 0);
  return out;
}
