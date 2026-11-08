/**
 * Writing image files. JPEG, WebP and AVIF use Squoosh's codecs (WASM:
 * MozJPEG, libwebp, libavif), so the output is the same in every browser
 * (canvas encoders vary, and none writes AVIF); PNG uses the browser's own
 * lossless encoder.
 */

import { formatToWrite, type Encoding } from '../core/encoding';
import type { ImageFormat } from '../core/files';
import { hasTransparency } from '../core/pixels';
import { largestThatFits } from '../core/search';
import { flattened, readPixels, resized, type Img } from './canvas';
import { decode } from './decode';

export interface Encoded {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * An image on its way through the chain: its pixels, how it will be saved,
 * and the file holding exactly these pixels, if there is one: the input file
 * (`original`) until a step changes the pixels, or the file Convert format,
 * Compress or Strip metadata wrote. That file is the output, unless a later
 * step changes the pixels.
 */
export interface Picture {
  image: Img;
  encoding: Encoding;
  file: { blob: Blob; original: boolean } | null;
}

/** Encode `image` as `encoding` says. */
export async function encodeImage(image: Img, encoding: Encoding): Promise<Encoded> {
  const format = formatToWrite(encoding, () => hasTransparency(readPixels(image).data));
  if (encoding.targetBytes !== null) return encodeToSize(image, format, encoding.targetBytes);
  return {
    blob: await encodeRaster(image, format, encoding.quality),
    width: image.width,
    height: image.height,
  };
}

/**
 * Write the picture's file right away (Convert format, Compress). Its pixels
 * become what the file holds, so later steps and the preview see the result,
 * compression artifacts included.
 */
export async function writeNow(picture: Picture, encoding: Encoding): Promise<Picture> {
  const { blob } = await encodeImage(picture.image, encoding);
  return { image: (await decode(blob)).image, encoding, file: { blob, original: false } };
}

/** Encode at `quality` (1–100; ignored by PNG). */
async function encodeRaster(image: Img, format: ImageFormat, quality: number): Promise<Blob> {
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
function encodeToSize(image: Img, format: ImageFormat, targetBytes: number): Promise<Encoded> {
  if (format === 'image/png') {
    return largestThatFits(
      async (scale) => {
        const scaled =
          scale >= 1 ? image : resized(image, image.width * scale, image.height * scale);
        const blob = await encodeRaster(scaled, format, 100);
        return { blob, width: scaled.width, height: scaled.height, size: blob.size };
      },
      targetBytes,
      0.05,
      1,
    );
  }
  return largestThatFits(
    async (quality) => {
      const blob = await encodeRaster(image, format, quality * 100);
      return { blob, width: image.width, height: image.height, size: blob.size };
    },
    targetBytes,
    0.05,
    0.95,
  );
}
