import { Injectable } from '@angular/core';

import { buildFilter, FilterAdjustments } from '../domain/adjustments';
import { NormalizedCrop, Orientation } from '../domain/crop';
import { dimensionsForMaxSize } from '../domain/image-files';
import { CanvasOutputFormat, ImageDimensions, ImageOutput } from '../domain/image-output.model';
import {
  MarginSides,
  MarginUnit,
  marginFillStyle,
  paintMarginBands,
  resolveMarginSides,
} from '../domain/margins';
import {
  MergeAlignment,
  MergeDirection,
  MergeResize,
  computeMergeLayout,
} from '../domain/merge-layout';
import { BackgroundKeyOptions } from '../domain/pixel-ops';
import { canvasToBlob, createCanvas, drawOriented } from './canvas';
import { keyBackgroundImageData, sharpenImageData } from './pixel-worker/pixel-worker.client';

/** Options every export shares: the encoding and the output file name. */
interface EncodeOptions {
  format: CanvasOutputFormat;
  /** 0.1–1; ignored for PNG. */
  quality: number;
  fileName: string;
}

export interface ResizeOptions extends EncodeOptions {
  /** Output size from the natural size; omitted = keep the natural size. */
  size?: (natural: ImageDimensions) => ImageDimensions;
}

export interface EditOptions extends EncodeOptions {
  orientation: Orientation;
  crop: NormalizedCrop;
  outputWidth: number;
  outputHeight: number;
}

export interface AdjustmentOptions extends FilterAdjustments, EncodeOptions {
  /** 0–100; applied in the pixel worker (canvas filters have no sharpen). */
  sharpen: number;
}

export interface MarginRenderOptions extends MarginSides, EncodeOptions {
  unit: MarginUnit;
  color: string;
  /** 0–100. */
  opacity: number;
}

export interface MergeOptions {
  direction: MergeDirection;
  alignment: MergeAlignment;
  resize: MergeResize;
  /** CSS color for the gaps/background, or `null` for a transparent canvas. */
  background: string | null;
  fileName: string;
}

/** Binary-search steps for {@link ImageProcessingService.compressToSize}: ~0.7% precision. */
const SEARCH_STEPS = 7;

/**
 * Client-side image rendering with the Canvas API: every browser-only tool's
 * export goes through here. Each method decodes the file once, draws it onto a
 * canvas, and encodes the result as an {@link ImageOutput} (whose object URL
 * the caller releases via {@link revoke}).
 */
@Injectable({ providedIn: 'root' })
export class ImageProcessingService {
  async getDimensions(file: File): Promise<ImageDimensions> {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  /** Re-encode an image, optionally at a new size (also strips all metadata). */
  async resize(file: File, options: ResizeOptions): Promise<ImageOutput> {
    const bitmap = await createImageBitmap(file);
    try {
      return await this.encodeScaled(bitmap, options.size?.(bitmap) ?? bitmap, options);
    } finally {
      bitmap.close();
    }
  }

  /**
   * Compress to (at most) `targetBytes` by binary-searching the quality — or,
   * for PNG where quality has no effect, the dimensions. Returns the largest
   * result that fits, or the smallest achievable one if even that is too big.
   */
  async compressToSize(
    file: File,
    options: { maxSize: number; targetBytes: number; format: CanvasOutputFormat; fileName: string },
  ): Promise<ImageOutput> {
    const bitmap = await createImageBitmap(file);
    try {
      const base = dimensionsForMaxSize(bitmap.width, bitmap.height, options.maxSize);
      const searchesScale = options.format === 'image/png';
      const render = (value: number): Promise<ImageOutput> => {
        const scale = searchesScale ? value : 1;
        const size = { width: base.width * scale, height: base.height * scale };
        return this.encodeScaled(bitmap, size, {
          ...options,
          quality: searchesScale ? 1 : value,
        });
      };

      let low = 0.05;
      let high = searchesScale ? 1 : 0.95;
      let best: ImageOutput | null = null;
      for (let step = 0; step < SEARCH_STEPS; step++) {
        const mid = (low + high) / 2;
        const candidate = await render(mid);
        if (candidate.size <= options.targetBytes) {
          // Fits — keep it and search upward for a higher-fidelity fit.
          if (best) this.revoke([best]);
          best = candidate;
          low = mid;
        } else {
          this.revoke([candidate]);
          high = mid;
        }
      }
      // Nothing fit: return the smallest the format can produce so the user
      // still gets a result (its size is shown on the output card).
      return best ?? (await render(low));
    } finally {
      bitmap.close();
    }
  }

  /** Letterbox an image onto a transparent square and wrap it as a single-size ICO. */
  async renderIco(file: File, options: { size: number; fileName: string }): Promise<ImageOutput> {
    const size = Math.max(16, Math.min(256, Math.round(options.size)));
    const bitmap = await createImageBitmap(file);
    const { canvas, context } = createCanvas(size, size);

    // Keep the aspect ratio instead of stretching non-square images.
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
    const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
    context.drawImage(
      bitmap,
      Math.round((size - drawWidth) / 2),
      Math.round((size - drawHeight) / 2),
      drawWidth,
      drawHeight,
    );
    bitmap.close();

    const png = await canvasToBlob(canvas, 'image/png', 1);
    return this.output(await createIcoBlob(png, size), size, size, options.fileName);
  }

  /** Apply rotate/flip, crop, and resize in a single pass (the Resize tool). */
  async renderEdit(file: File, options: EditOptions): Promise<ImageOutput> {
    const bitmap = await createImageBitmap(file);
    const oriented = document.createElement('canvas');
    drawOriented(oriented, bitmap, bitmap.width, bitmap.height, options.orientation);
    bitmap.close();

    const { width, height } = oriented;
    const cropX = clamp(Math.round(options.crop.x * width), 0, width - 1);
    const cropY = clamp(Math.round(options.crop.y * height), 0, height - 1);
    const cropWidth = clamp(Math.round(options.crop.width * width), 1, width - cropX);
    const cropHeight = clamp(Math.round(options.crop.height * height), 1, height - cropY);

    const outputWidth = Math.max(1, Math.round(options.outputWidth));
    const outputHeight = Math.max(1, Math.round(options.outputHeight));
    const { canvas, context } = createCanvas(outputWidth, outputHeight);
    context.drawImage(
      oriented,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    return this.encode(canvas, options);
  }

  /** Brightness/contrast/color filters (canvas `filter`) plus an optional sharpen pass. */
  async renderAdjustments(file: File, options: AdjustmentOptions): Promise<ImageOutput> {
    const bitmap = await createImageBitmap(file);
    const { canvas, context } = createCanvas(bitmap.width, bitmap.height);
    context.filter = buildFilter(options);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    if (options.sharpen > 0) {
      const source = context.getImageData(0, 0, canvas.width, canvas.height);
      context.putImageData(await sharpenImageData(source, options.sharpen / 100), 0, 0);
    }

    return this.encode(canvas, options);
  }

  /** Key out a background color; always PNG so the transparency survives. */
  async renderBackgroundRemoved(
    file: File,
    options: BackgroundKeyOptions & { fileName: string },
  ): Promise<ImageOutput> {
    const bitmap = await createImageBitmap(file);
    const { canvas, context } = createCanvas(bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    context.putImageData(await keyBackgroundImageData(imageData, options), 0, 0);

    return this.encode(canvas, { format: 'image/png', quality: 1, fileName: options.fileName });
  }

  /** Surround an image with a colored (optionally transparent) margin. */
  async renderMargins(file: File, options: MarginRenderOptions): Promise<ImageOutput> {
    const bitmap = await createImageBitmap(file);
    const px = resolveMarginSides(options, options.unit, bitmap.width, bitmap.height);
    const totalWidth = bitmap.width + px.left + px.right;
    const totalHeight = bitmap.height + px.top + px.bottom;

    const { canvas, context } = createCanvas(totalWidth, totalHeight);
    context.drawImage(bitmap, px.left, px.top);
    bitmap.close();
    paintMarginBands(
      context,
      totalWidth,
      totalHeight,
      px,
      marginFillStyle(options.color, options.opacity),
    );

    return this.encode(canvas, options);
  }

  /** Combine several images into one PNG, stacked along the chosen axis. */
  async renderMerged(files: readonly File[], options: MergeOptions): Promise<ImageOutput> {
    if (files.length === 0) {
      throw new Error('Select at least one image to merge.');
    }

    const bitmaps = await Promise.all(files.map((file) => createImageBitmap(file)));
    try {
      const layout = computeMergeLayout(bitmaps, options);
      const { canvas, context } = createCanvas(
        Math.max(1, layout.width),
        Math.max(1, layout.height),
      );

      // A transparent canvas keeps the gaps see-through; otherwise paint them.
      if (options.background) {
        context.fillStyle = options.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      layout.placements.forEach((place, i) => {
        context.drawImage(bitmaps[i], place.x, place.y, place.width, place.height);
      });

      // PNG so a transparent background (and any source alpha) is preserved.
      return await this.encode(canvas, {
        format: 'image/png',
        quality: 1,
        fileName: options.fileName,
      });
    } finally {
      bitmaps.forEach((bitmap) => bitmap.close());
    }
  }

  /** Release the object URLs behind outputs that are no longer shown. */
  revoke(outputs: readonly ImageOutput[]): void {
    for (const output of outputs) {
      URL.revokeObjectURL(output.url);
    }
  }

  /** Draw a decoded image at `size` (rounded, at least 1 px) and encode it. */
  private encodeScaled(
    bitmap: ImageBitmap,
    size: ImageDimensions,
    options: EncodeOptions,
  ): Promise<ImageOutput> {
    const width = Math.max(1, Math.round(size.width));
    const height = Math.max(1, Math.round(size.height));
    const { canvas, context } = createCanvas(width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return this.encode(canvas, options);
  }

  private async encode(canvas: HTMLCanvasElement, options: EncodeOptions): Promise<ImageOutput> {
    const blob = await canvasToBlob(canvas, options.format, options.quality);
    return this.output(blob, canvas.width, canvas.height, options.fileName);
  }

  private output(blob: Blob, width: number, height: number, fileName: string): ImageOutput {
    return { fileName, blob, url: URL.createObjectURL(blob), size: blob.size, width, height };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Wrap a PNG in a single-image ICO container (PNG-compressed entries are valid ICO). */
async function createIcoBlob(pngBlob: Blob, size: number): Promise<Blob> {
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const headerSize = 6;
  const entrySize = 16;
  const bytes = new Uint8Array(headerSize + entrySize + pngBytes.length);
  const view = new DataView(bytes.buffer);
  const dimensionByte = size >= 256 ? 0 : size; // 0 means 256 in the ICO format

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, 1, true); // image count
  view.setUint8(6, dimensionByte); // width
  view.setUint8(7, dimensionByte); // height
  view.setUint8(8, 0); // palette size
  view.setUint8(9, 0); // reserved
  view.setUint16(10, 1, true); // color planes
  view.setUint16(12, 32, true); // bits per pixel
  view.setUint32(14, pngBytes.length, true); // image data size
  view.setUint32(18, headerSize + entrySize, true); // image data offset
  bytes.set(pngBytes, headerSize + entrySize);

  return new Blob([bytes], { type: 'image/x-icon' });
}
