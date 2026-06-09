import { Injectable } from '@angular/core';

import ImageTracer from 'imagetracerjs';

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

export interface BackgroundKeyOptions {
  color: string;
  tolerance: number;
  edgeSmoothing: number;
}

export interface BackgroundRemovalOptions extends BackgroundKeyOptions {
  fileName: string;
}

export interface IcoRenderOptions {
  size: number;
  fileName: string;
}

export interface SvgRenderOptions {
  /** Number of palette colors to posterize to before tracing. */
  colors: number;
  /** Longest side of the sampled grid; larger keeps finer detail but grows the file. */
  maxDimension: number;
  /** Speckle filter: drop traced paths shorter than this many nodes. */
  pathOmit: number;
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
    applyBackgroundKey(imageData, options);
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

  /**
   * Vectorize an image into a color SVG. The bitmap is sampled at a capped
   * resolution and traced by imagetracerjs, which fits straight lines and
   * quadratic splines to each color region so edges come out smooth rather
   * than as pixel staircases.
   */
  async renderSvg(file: File, options: SvgRenderOptions): Promise<ImageOutput> {
    const image = await this.loadImage(file);
    const sourceWidth = image.width;
    const sourceHeight = image.height;

    const downscale = Math.min(1, options.maxDimension / Math.max(sourceWidth, sourceHeight));
    const gridWidth = Math.max(1, Math.round(sourceWidth * downscale));
    const gridHeight = Math.max(1, Math.round(sourceHeight * downscale));

    const canvas = document.createElement('canvas');
    canvas.width = gridWidth;
    canvas.height = gridHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image.source, 0, 0, gridWidth, gridHeight);
    image.release();

    const imageData = context.getImageData(0, 0, gridWidth, gridHeight);
    // Scale the vector output back up to the source pixel dimensions.
    const svg = ImageTracer.imagedataToSVG(imageData, {
      numberofcolors: Math.max(2, Math.min(64, Math.round(options.colors))),
      colorsampling: 2,
      colorquantcycles: 3,
      pathomit: Math.max(0, Math.round(options.pathOmit)),
      ltres: 1,
      qtres: 1,
      rightangleenhance: true,
      roundcoords: 1,
      blurradius: 0,
      scale: gridWidth > 0 ? sourceWidth / gridWidth : 1,
    });

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    return this.createOutput(options.fileName, blob, sourceWidth, sourceHeight);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Key out a background color by turning matching pixels transparent, mutating
 * the `ImageData` in place. Shared by the export pass and the live preview.
 */
export function applyBackgroundKey(imageData: ImageData, options: BackgroundKeyOptions): void {
  const key = hexToRgb(options.color);
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
