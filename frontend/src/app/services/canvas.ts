/**
 * Canvas helpers shared by the export pipeline (ImageProcessingService) and the
 * tools' live previews. A tool whose preview draws the same picture as its
 * export uses the same `draw*` function for both (downscaled via `maxSide`),
 * so the two can't drift apart.
 */

import { Orientation, orientedSize } from '../domain/crop';
import { CanvasOutputFormat } from '../domain/image-output.model';
import {
  MarginSides,
  MarginUnit,
  marginFillStyle,
  paintMarginBands,
  resolveMarginSides,
} from '../domain/margins';
import { MergeLayoutOptions, computeMergeLayout } from '../domain/merge-layout';

/** A margin's settings (sides in `unit`), as the Margin tool collects them. */
export interface MarginSettings extends MarginSides {
  unit: MarginUnit;
  color: string;
  /** 0–100. */
  opacity: number;
}

export interface MergeSettings extends MergeLayoutOptions {
  /** CSS color behind the images, or `null` for a transparent canvas. */
  background: string | null;
}

/** The canvas's 2D context with high-quality smoothing (call again after resizing the canvas). */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is not available in this browser.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

/** Create a canvas and its 2D context. */
export function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: context2d(canvas) };
}

/** Draw `bitmap` with rotate/flip applied, sizing the canvas to the oriented size. */
export function drawOriented(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  orientation: Orientation,
): void {
  const size = orientedSize(bitmap, orientation.rotateDegrees);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = context2d(canvas);
  context.translate(size.width / 2, size.height / 2);
  context.rotate((orientation.rotateDegrees * Math.PI) / 180);
  context.scale(orientation.flipHorizontal ? -1 : 1, orientation.flipVertical ? -1 : 1);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
}

/** Draw `bitmap` framed by its margin bands, sizing the canvas to fit (at most `maxSide`). */
export function drawMargins(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  margin: MarginSettings,
  maxSide = Infinity,
): void {
  const sides = resolveMarginSides(margin, margin.unit, bitmap.width, bitmap.height);
  const fullWidth = bitmap.width + sides.left + sides.right;
  const fullHeight = bitmap.height + sides.top + sides.bottom;
  const scale = Math.min(1, maxSide / Math.max(fullWidth, fullHeight));
  const px = (value: number) => Math.round(value * scale);
  const bands = {
    top: px(sides.top),
    right: px(sides.right),
    bottom: px(sides.bottom),
    left: px(sides.left),
  };

  canvas.width = Math.max(1, px(bitmap.width) + bands.left + bands.right);
  canvas.height = Math.max(1, px(bitmap.height) + bands.top + bands.bottom);
  const context = context2d(canvas);
  context.drawImage(bitmap, bands.left, bands.top, px(bitmap.width), px(bitmap.height));
  paintMarginBands(
    context,
    canvas.width,
    canvas.height,
    bands,
    marginFillStyle(margin.color, margin.opacity),
  );
}

/** Draw `bitmaps` stacked as `merge` says, sizing the canvas to fit (at most `maxSide`). */
export function drawMerged(
  canvas: HTMLCanvasElement,
  bitmaps: readonly ImageBitmap[],
  merge: MergeSettings,
  maxSide = Infinity,
): void {
  const layout = computeMergeLayout(bitmaps, merge);
  const scale = Math.min(1, maxSide / Math.max(layout.width, layout.height));
  canvas.width = Math.max(1, Math.round(layout.width * scale));
  canvas.height = Math.max(1, Math.round(layout.height * scale));
  const context = context2d(canvas);

  if (merge.background) {
    context.fillStyle = merge.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  layout.placements.forEach((place, i) => {
    context.drawImage(
      bitmaps[i],
      place.x * scale,
      place.y * scale,
      place.width * scale,
      place.height * scale,
    );
  });
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
