import { Injectable } from '@angular/core';

import { CanvasOutputFormat, ImageDimensions, ImageOutput } from '../models/image-output.model';

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

export interface BackgroundRemovalOptions {
  color: string;
  tolerance: number;
  edgeSmoothing: number;
  fileName: string;
}

export interface IcoRenderOptions {
  size: number;
  fileName: string;
}

export type CropAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right';

export interface CropOptions {
  aspectWidth: number;
  aspectHeight: number;
  anchor: CropAnchor;
  format: CanvasOutputFormat;
  quality: number;
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

    const key = hexToRgb(options.color);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const transparentLimit = (Math.max(0, Math.min(100, options.tolerance)) / 100) * 441.672;
    const smoothingRange = (Math.max(0, Math.min(100, options.edgeSmoothing)) / 100) * 180;

    for (let index = 0; index < data.length; index += 4) {
      const distance = colorDistance(data[index], data[index + 1], data[index + 2], key);

      if (distance <= transparentLimit) {
        data[index + 3] = 0;
        continue;
      }

      if (smoothingRange > 0 && distance <= transparentLimit + smoothingRange) {
        const alphaScale = (distance - transparentLimit) / smoothingRange;
        data[index + 3] = Math.round(data[index + 3] * alphaScale);
      }
    }

    context.putImageData(imageData, 0, 0);
    const blob = await this.canvasToBlob(canvas, 'image/png', 1);

    return this.createOutput(options.fileName, blob, canvas.width, canvas.height);
  }

  async renderIco(file: File, options: IcoRenderOptions): Promise<ImageOutput> {
    const size = Math.max(16, Math.min(256, Math.round(options.size)));
    const canvas = await this.renderToCanvas(file, {
      width: size,
      height: size,
      format: 'image/png',
      quality: 1,
      fileName: options.fileName,
    });
    const pngBlob = await this.canvasToBlob(canvas, 'image/png', 1);
    const iconBlob = await createIcoBlob(pngBlob, size);

    return this.createOutput(options.fileName, iconBlob, canvas.width, canvas.height);
  }

  async renderCrop(file: File, options: CropOptions): Promise<ImageOutput> {
    const image = await this.loadImage(file);
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    const targetRatio = options.aspectWidth / options.aspectHeight;
    const sourceRatio = sourceWidth / sourceHeight;

    let cropWidth: number;
    let cropHeight: number;
    if (sourceRatio > targetRatio) {
      cropHeight = sourceHeight;
      cropWidth = Math.round(sourceHeight * targetRatio);
    } else {
      cropWidth = sourceWidth;
      cropHeight = Math.round(sourceWidth / targetRatio);
    }
    cropWidth = Math.max(1, Math.min(sourceWidth, cropWidth));
    cropHeight = Math.max(1, Math.min(sourceHeight, cropHeight));

    const offsetX = anchorOffset(options.anchor, 'x', sourceWidth, cropWidth);
    const offsetY = anchorOffset(options.anchor, 'y', sourceHeight, cropHeight);

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image.source,
      offsetX,
      offsetY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );
    image.release();

    const blob = await this.canvasToBlob(canvas, options.format, options.quality);
    return this.createOutput(options.fileName, blob, cropWidth, cropHeight);
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
      applySharpen(context, canvas.width, canvas.height, options.sharpen / 100);
    }

    const blob = await this.canvasToBlob(canvas, options.format, options.quality);
    return this.createOutput(options.fileName, blob, canvas.width, canvas.height);
  }

  revoke(outputs: readonly ImageOutput[]): void {
    for (const output of outputs) {
      URL.revokeObjectURL(output.url);
    }
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

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(
    normalized.length === 3 ? expandShortHex(normalized) : normalized,
    16,
  );

  if (Number.isNaN(value)) {
    return { red: 255, green: 255, blue: 255 };
  }

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function expandShortHex(hex: string): string {
  return hex
    .split('')
    .map((value) => `${value}${value}`)
    .join('');
}

function anchorOffset(
  anchor: CropAnchor,
  axis: 'x' | 'y',
  sourceSize: number,
  cropSize: number,
): number {
  const slack = sourceSize - cropSize;

  if (axis === 'x') {
    if (anchor === 'left') return 0;
    if (anchor === 'right') return slack;
  } else {
    if (anchor === 'top') return 0;
    if (anchor === 'bottom') return slack;
  }

  return Math.round(slack / 2);
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

function applySharpen(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
): void {
  const source = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  const src = source.data;
  const out = output.data;
  const center = 1 + 4 * amount;

  const sampleAt = (x: number, y: number): number =>
    (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const up = sampleAt(x, y - 1);
      const down = sampleAt(x, y + 1);
      const left = sampleAt(x - 1, y);
      const right = sampleAt(x + 1, y);

      for (let channel = 0; channel < 3; channel++) {
        const value =
          src[index + channel] * center -
          amount *
            (src[up + channel] + src[down + channel] + src[left + channel] + src[right + channel]);
        out[index + channel] = value < 0 ? 0 : value > 255 ? 255 : value;
      }

      out[index + 3] = src[index + 3];
    }
  }

  context.putImageData(output, 0, 0);
}

function colorDistance(
  red: number,
  green: number,
  blue: number,
  key: { red: number; green: number; blue: number },
): number {
  return Math.hypot(red - key.red, green - key.green, blue - key.blue);
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
