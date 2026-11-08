/**
 * Writing image files. JPEG, WebP and AVIF use Squoosh's codecs (WASM:
 * MozJPEG, libwebp, libavif), so the output is the same in every browser and
 * smaller than `canvas.toBlob`'s; PNG uses the browser's own lossless encoder.
 */

import { formatToWrite, type Encoding, type FileFormat } from '../core/encoding';
import type { RasterFormat } from '../core/files';
import { pngToIco } from '../core/ico';
import { hasTransparency } from '../core/pixels';
import { largestThatFits } from '../core/search';
import { context2d, createCanvas, flattened, readPixels, resized, type Img } from './canvas';
import { decode } from './decode';

export interface Encoded {
  blob: Blob;
  width: number;
  height: number;
  format: FileFormat;
}

/**
 * An image on its way through the chain: its pixels, how it will be saved,
 * and the file that holds exactly these pixels, if there is one (the input
 * file until a step changes the pixels, or the file Convert format or
 * Compress just wrote). That file is the output, unless a later step
 * changes the pixels again.
 */
export interface Picture {
  image: Img;
  encoding: Encoding;
  file: { blob: Blob; original: boolean } | null;
}

/** Encode `image` as `encoding` says. */
export async function encodeImage(image: Img, encoding: Encoding): Promise<Encoded> {
  const format = formatToWrite(encoding, () => hasTransparency(readPixels(image).data));
  if (format === 'image/x-icon') return encodeIco(image, encoding.icoSize);
  if (encoding.targetBytes !== null) return encodeToSize(image, format, encoding.targetBytes);
  return {
    blob: await encodeRaster(image, format, encoding.quality),
    width: image.width,
    height: image.height,
    format,
  };
}

/**
 * Write the picture's file right away (Convert format, Compress). Its pixels
 * become what the file holds, so later steps and the preview see the result,
 * compression artifacts included.
 */
export async function writeNow(picture: Picture, encoding: Encoding): Promise<Picture> {
  const encoded = await encodeImage(picture.image, encoding);
  const image =
    encoded.format === 'image/x-icon'
      ? letterboxed(picture.image, encoding.icoSize)
      : (await decode(encoded.blob)).image;
  return {
    image,
    encoding: { ...encoding, format: encoded.format },
    file: { blob: encoded.blob, original: false },
  };
}

/** Encode at `quality` (0–100; ignored by PNG). */
export async function encodeRaster(
  image: Img,
  format: RasterFormat,
  quality: number,
): Promise<Blob> {
  if (format === 'image/png') return image.convertToBlob({ type: 'image/png' });

  // JPEG has no alpha channel: flatten onto white instead of letting
  // transparent pixels turn black.
  const source = format === 'image/jpeg' ? flattened(image) : image;
  const { image: data } = readPixels(source);
  const q = Math.round(Math.min(100, Math.max(1, quality)));
  let buffer: ArrayBuffer;
  switch (format) {
    case 'image/jpeg': {
      const { default: encode } = await import('@jsquash/jpeg/encode');
      buffer = await encode(data, { quality: q });
      break;
    }
    case 'image/webp': {
      const { default: encode } = await import('@jsquash/webp/encode');
      buffer = await encode(data, { quality: q, lossless: q === 100 ? 1 : 0 });
      break;
    }
    case 'image/avif': {
      const { default: encode } = await import('@jsquash/avif/encode');
      buffer = await encode(data, { quality: q, lossless: q === 100, speed: 7 });
      break;
    }
  }
  return new Blob([buffer], { type: format });
}

/**
 * Fit a byte budget: binary-search the quality, or — for lossless PNG — the
 * dimensions. Returns the best result that fits, or the smallest one possible.
 */
async function encodeToSize(
  image: Img,
  format: RasterFormat,
  targetBytes: number,
): Promise<Encoded> {
  if (format === 'image/png') {
    return largestThatFits(
      async (scale) => {
        const scaled =
          scale >= 1 ? image : resized(image, image.width * scale, image.height * scale);
        const blob = await encodeRaster(scaled, format, 100);
        return { blob, width: scaled.width, height: scaled.height, format, size: blob.size };
      },
      targetBytes,
      0.05,
      1,
    );
  }
  return largestThatFits(
    async (quality) => {
      const blob = await encodeRaster(image, format, quality * 100);
      return { blob, width: image.width, height: image.height, format, size: blob.size };
    },
    targetBytes,
    0.05,
    0.95,
  );
}

/** The image letterboxed onto a transparent square (keeping its aspect ratio), as in an ICO. */
function letterboxed(image: Img, size: number): Img {
  const side = Math.round(Math.min(256, Math.max(16, size)));
  const canvas = createCanvas(side, side);
  const scale = Math.min(side / image.width, side / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  context2d(canvas).drawImage(
    image,
    Math.round((side - width) / 2),
    Math.round((side - height) / 2),
    width,
    height,
  );
  return canvas;
}

async function encodeIco(image: Img, size: number): Promise<Encoded> {
  const canvas = letterboxed(image, size);
  const png = new Uint8Array(
    await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
  );
  return {
    blob: new Blob([pngToIco(png, canvas.width)], { type: 'image/x-icon' }),
    width: canvas.width,
    height: canvas.height,
    format: 'image/x-icon',
  };
}
