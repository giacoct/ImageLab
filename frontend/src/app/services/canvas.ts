/**
 * Small Canvas helpers shared by the export pipeline (ImageProcessingService)
 * and the tools' live previews.
 */

import { CanvasOutputFormat } from '../domain/image-output.model';
import { Orientation, orientedSize } from '../domain/crop';

/** Create a canvas and its 2D context (with high-quality smoothing on). */
export function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is not available in this browser.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return { canvas, context };
}

/**
 * Draw `source` scaled to `width`×`height` with rotate/flip applied, filling a
 * canvas whose size is the oriented size (axes swapped for 90°/270°).
 */
export function drawOriented(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  orientation: Orientation,
): void {
  const size = orientedSize({ width, height }, orientation.rotateDegrees);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is not available in this browser.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(size.width / 2, size.height / 2);
  context.rotate((orientation.rotateDegrees * Math.PI) / 180);
  context.scale(orientation.flipHorizontal ? -1 : 1, orientation.flipVertical ? -1 : 1);
  context.drawImage(source, -width / 2, -height / 2, width, height);
}

/** Encode a canvas as an image blob (`quality` 0–1 is ignored for PNG). */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: CanvasOutputFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The browser could not export this image.')),
      format,
      format === 'image/png' ? undefined : quality,
    );
  });
}

/**
 * Decode a file into a downscaled `ImageData` snapshot (longest side
 * `maxSide`) for cheap live previews.
 */
export async function loadPreviewImageData(file: File, maxSide: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const { context } = createCanvas(width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

let avifSupport: Promise<boolean> | null = null;

/**
 * Whether this browser can *encode* AVIF via `canvas.toBlob`. Chromium can;
 * elsewhere the canvas silently falls back to PNG, which the blob-type check
 * detects. The probe runs once and is cached.
 */
export function supportsAvifOutput(): Promise<boolean> {
  avifSupport ??= new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvas.toBlob((blob) => resolve(blob?.type === 'image/avif'), 'image/avif');
    } catch {
      resolve(false);
    }
  });
  return avifSupport;
}
