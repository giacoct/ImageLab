import { Injectable } from '@angular/core';

import { ImageDimensions, ImageOutput, OutputFormat } from '../models/image-output.model';

export interface RenderOptions {
  width: number;
  height: number;
  format: OutputFormat;
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
    const image = await this.loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(options.width));
    canvas.height = Math.max(1, Math.round(options.height));

    const context = canvas.getContext('2d');
    if (!context) {
      image.release();
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    image.release();

    const blob = await this.canvasToBlob(canvas, options.format, options.quality);

    return {
      fileName: options.fileName,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      width: canvas.width,
      height: canvas.height,
    };
  }

  revoke(outputs: readonly ImageOutput[]): void {
    for (const output of outputs) {
      URL.revokeObjectURL(output.url);
    }
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
    format: OutputFormat,
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
}
