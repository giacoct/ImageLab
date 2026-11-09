/**
 * OffscreenCanvas helpers. Every operation works on an OffscreenCanvas (the
 * pipeline's image type), so it runs the same in the engine worker and in
 * the browser tests.
 */

import type { Pixels } from "../core/pixels";

/** The pipeline's image type. */
export type Img = OffscreenCanvas;

export function context2d(
  canvas: OffscreenCanvas,
): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: false });
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

/** A canvas holding `data` (RGBA, straight alpha). */
export function fromPixels(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): OffscreenCanvas {
  const canvas = createCanvas(width, height);
  context2d(canvas).putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
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
