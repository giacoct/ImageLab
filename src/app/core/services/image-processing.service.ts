import { Injectable } from '@angular/core';

import { CanvasOutputFormat, ImageDimensions, ImageOutput } from '../models/image-output.model';
import {
  MarginSides,
  MarginUnit,
  marginFillStyle,
  paintMarginBands,
  resolveMarginSides,
} from '../utils/margins';
import {
  MergeAlignment,
  MergeDirection,
  MergeResize,
  computeMergeLayout,
} from '../utils/merge-layout';
import { BackgroundKeyOptions, keyBackgroundPixels } from '../workers/pixel-ops';
import { keyBackgroundImageData, sharpenImageData } from '../workers/pixel-worker.client';

export type { BackgroundKeyOptions } from '../workers/pixel-ops';

export interface RenderTransform {
  rotateDegrees: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export interface RenderOptions {
  width: number;
  height: number;
  format: CanvasOutputFormat;
  quality: number;
  fileName: string;
  transform?: RenderTransform;
}

export interface BackgroundRemovalOptions extends BackgroundKeyOptions {
  fileName: string;
}

export interface IcoRenderOptions {
  size: number;
  fileName: string;
}

/** A crop region expressed as fractions (0..1) of the transformed image. */
export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditOptions {
  transform: RenderTransform;
  crop: NormalizedCrop;
  outputWidth: number;
  outputHeight: number;
  format: CanvasOutputFormat;
  quality: number;
  fileName: string;
}

export interface MarginRenderOptions extends MarginSides {
  unit: MarginUnit;
  color: string;
  /** 0–100. */
  opacity: number;
  format: CanvasOutputFormat;
  quality: number;
  fileName: string;
}

export interface MergeOptions {
  direction: MergeDirection;
  alignment: MergeAlignment;
  resize: MergeResize;
  /** CSS color for the gaps/background, or `null` for a transparent canvas. */
  background: string | null;
  fileName: string;
}

export interface AdjustmentOptions {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  invert: boolean;
  blur: number;
  sharpen: number;
  format: CanvasOutputFormat;
  quality: number;
  fileName: string;
}

@Injectable({ providedIn: 'root' })
export class ImageProcessingService {
  async getDimensions(file: File): Promise<ImageDimensions> {
    const image = await this.loadImage(file);
    const dimensions = {
      width: image.width,
      height: image.height,
    };
    image.release();
    return dimensions;
  }

  async renderToBlob(file: File, options: RenderOptions): Promise<ImageOutput> {
    const canvas = await this.renderToCanvas(file, options);
    const blob = await this.canvasToBlob(canvas, options.format, options.quality);

    return this.createOutput(options.fileName, blob, canvas.width, canvas.height);
  }

  async renderBackgroundRemoved(
    file: File,
    options: BackgroundRemovalOptions,
  ): Promise<ImageOutput> {
    const image = await this.loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.drawImage(image.source, 0, 0);
    image.release();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const keyed = await keyBackgroundImageData(imageData, options);
    context.putImageData(keyed, 0, 0);
    const blob = await this.canvasToBlob(canvas, 'image/png', 1);

    return this.createOutput(options.fileName, blob, canvas.width, canvas.height);
  }

  async renderIco(file: File, options: IcoRenderOptions): Promise<ImageOutput> {
    const size = Math.max(16, Math.min(256, Math.round(options.size)));
    const image = await this.loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    // Letterbox onto a transparent square so non-square images keep their
    // aspect ratio instead of being stretched.
    const scale = Math.min(size / image.width, size / image.height);
    const drawWidth = Math.max(1, Math.round(image.width * scale));
    const drawHeight = Math.max(1, Math.round(image.height * scale));
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image.source,
      Math.round((size - drawWidth) / 2),
      Math.round((size - drawHeight) / 2),
      drawWidth,
      drawHeight,
    );
    image.release();

    const pngBlob = await this.canvasToBlob(canvas, 'image/png', 1);
    const iconBlob = await createIcoBlob(pngBlob, size);

    return this.createOutput(options.fileName, iconBlob, size, size);
  }

  /** Apply rotate/flip, crop, and resize in a single pass for the image editor. */
  async renderEdit(file: File, options: EditOptions): Promise<ImageOutput> {
    const image = await this.loadImage(file);
    const transformed = this.drawTransformed(image, options.transform);
    image.release();

    const cropX = clamp(Math.round(options.crop.x * transformed.width), 0, transformed.width - 1);
    const cropY = clamp(Math.round(options.crop.y * transformed.height), 0, transformed.height - 1);
    const cropWidth = clamp(
      Math.round(options.crop.width * transformed.width),
      1,
      transformed.width - cropX,
    );
    const cropHeight = clamp(
      Math.round(options.crop.height * transformed.height),
      1,
      transformed.height - cropY,
    );

    const outputWidth = Math.max(1, Math.round(options.outputWidth));
    const outputHeight = Math.max(1, Math.round(options.outputHeight));

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      transformed,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    const blob = await this.canvasToBlob(canvas, options.format, options.quality);
    return this.createOutput(options.fileName, blob, outputWidth, outputHeight);
  }

  async renderAdjustments(file: File, options: AdjustmentOptions): Promise<ImageOutput> {
    const image = await this.loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.filter = buildFilterString(options);
    context.drawImage(image.source, 0, 0);
    image.release();

    if (options.sharpen > 0) {
      const source = context.getImageData(0, 0, canvas.width, canvas.height);
      const sharpened = await sharpenImageData(source, options.sharpen / 100);
      context.putImageData(sharpened, 0, 0);
    }

    const blob = await this.canvasToBlob(canvas, options.format, options.quality);
    return this.createOutput(options.fileName, blob, canvas.width, canvas.height);
  }

  /** Surround an image with a colored (optionally transparent) margin. */
  async renderMargins(file: File, options: MarginRenderOptions): Promise<ImageOutput> {
    const image = await this.loadImage(file);
    const px = resolveMarginSides(options, options.unit, image.width, image.height);
    const totalWidth = image.width + px.left + px.right;
    const totalHeight = image.height + px.top + px.bottom;

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.drawImage(image.source, px.left, px.top);
    image.release();
    paintMarginBands(
      context,
      totalWidth,
      totalHeight,
      px,
      marginFillStyle(options.color, options.opacity),
    );

    const blob = await this.canvasToBlob(canvas, options.format, options.quality);
    return this.createOutput(options.fileName, blob, totalWidth, totalHeight);
  }

  /** Combine several images into one, stacked along the chosen axis. */
  async renderMerged(files: readonly File[], options: MergeOptions): Promise<ImageOutput> {
    if (files.length === 0) {
      throw new Error('Select at least one image to merge.');
    }

    const images = await Promise.all(files.map((file) => this.loadImage(file)));
    try {
      const layout = computeMergeLayout(
        images.map((image) => ({ width: image.width, height: image.height })),
        options,
      );

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, layout.width);
      canvas.height = Math.max(1, layout.height);

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas rendering is not available in this browser.');
      }

      // A transparent canvas keeps the gaps see-through; otherwise paint them.
      if (options.background) {
        context.fillStyle = options.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      layout.placements.forEach((place, i) => {
        context.drawImage(images[i].source, place.x, place.y, place.width, place.height);
      });

      // PNG so a transparent background (and any source alpha) is preserved.
      const blob = await this.canvasToBlob(canvas, 'image/png', 1);
      return this.createOutput(options.fileName, blob, canvas.width, canvas.height);
    } finally {
      images.forEach((image) => image.release());
    }
  }

  revoke(outputs: readonly ImageOutput[]): void {
    for (const output of outputs) {
      URL.revokeObjectURL(output.url);
    }
  }

  /** Draw a loaded image at natural size with rotate/flip applied. */
  private drawTransformed(
    image: { source: CanvasImageSource; width: number; height: number },
    transform: RenderTransform,
  ): HTMLCanvasElement {
    const swapsDimensions = transform.rotateDegrees === 90 || transform.rotateDegrees === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swapsDimensions ? image.height : image.width;
    canvas.height = swapsDimensions ? image.width : image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((transform.rotateDegrees * Math.PI) / 180);
    context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
    context.drawImage(image.source, -image.width / 2, -image.height / 2, image.width, image.height);

    return canvas;
  }

  private async renderToCanvas(file: File, options: RenderOptions): Promise<HTMLCanvasElement> {
    const image = await this.loadImage(file);
    const sourceWidth = Math.max(1, Math.round(options.width));
    const sourceHeight = Math.max(1, Math.round(options.height));
    const transform = options.transform ?? {
      rotateDegrees: 0,
      flipHorizontal: false,
      flipVertical: false,
    };
    const swapsDimensions = transform.rotateDegrees === 90 || transform.rotateDegrees === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swapsDimensions ? sourceHeight : sourceWidth;
    canvas.height = swapsDimensions ? sourceWidth : sourceHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((transform.rotateDegrees * Math.PI) / 180);
    context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
    context.drawImage(image.source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    image.release();

    return canvas;
  }

  private async loadImage(file: File): Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
    release: () => void;
  }> {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.src = url;

    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  }

  private canvasToBlob(
    canvas: HTMLCanvasElement,
    format: CanvasOutputFormat,
    quality: number,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error('The browser could not export this image.'));
        },
        format,
        format === 'image/png' ? undefined : quality,
      );
    });
  }

  private createOutput(fileName: string, blob: Blob, width: number, height: number): ImageOutput {
    return {
      fileName,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      width,
      height,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Key out a background color synchronously, mutating the `ImageData` in
 * place. Used by the live preview on small snapshots; full-resolution exports
 * go through the pixel worker instead.
 */
export function applyBackgroundKey(imageData: ImageData, options: BackgroundKeyOptions): void {
  keyBackgroundPixels(imageData.data, options);
}

function buildFilterString(options: AdjustmentOptions): string {
  const parts = [
    `brightness(${options.brightness}%)`,
    `contrast(${options.contrast}%)`,
    `saturate(${options.saturation}%)`,
  ];

  if (options.grayscale > 0) parts.push(`grayscale(${options.grayscale}%)`);
  if (options.sepia > 0) parts.push(`sepia(${options.sepia}%)`);
  if (options.invert) parts.push('invert(100%)');
  if (options.blur > 0) parts.push(`blur(${options.blur}px)`);

  return parts.join(' ');
}

async function createIcoBlob(pngBlob: Blob, size: number): Promise<Blob> {
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const headerSize = 6;
  const entrySize = 16;
  const bytes = new Uint8Array(headerSize + entrySize + pngBytes.length);
  const view = new DataView(bytes.buffer);
  const dimensionByte = size >= 256 ? 0 : size;

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, dimensionByte);
  view.setUint8(7, dimensionByte);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, headerSize + entrySize, true);
  bytes.set(pngBytes, headerSize + entrySize);

  return new Blob([bytes], { type: 'image/x-icon' });
}
