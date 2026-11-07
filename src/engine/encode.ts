/**
 * The export step: encode the pipeline's result as a file. JPEG, WebP and
 * AVIF use Squoosh's codecs (WASM: MozJPEG, libwebp, libavif), so the output
 * is the same in every browser and smaller than `canvas.toBlob`'s; PNG uses
 * the browser's own lossless encoder.
 */

import { sameFormat, type RasterFormat } from '../core/files';
import { pngToIco } from '../core/ico';
import { hasTransparency } from '../core/pixels';
import type { ExportSettings } from '../core/recipe';
import { largestThatFits } from '../core/search';
import { context2d, createCanvas, flattened, readPixels, resized, type Img } from './canvas';

export interface Encoded {
  blob: Blob;
  width: number;
  height: number;
}

/** Encode `image` (decoded from a file of `sourceType`) as the export settings say. */
export async function encodeImage(
  image: Img,
  settings: ExportSettings,
  sourceType: string,
): Promise<Encoded> {
  if (settings.format === 'ico') return encodeIco(image, settings.icoSize);

  const format = resolveFormat(settings.format, sourceType, () =>
    hasTransparency(readPixels(image).data),
  );
  if (settings.format !== 'keep' && settings.sizing === 'target') {
    return encodeToSize(image, format, settings.targetKb * 1024);
  }
  // `keep` only re-encodes files that can't be cleaned losslessly: stay near-lossless.
  const quality = settings.format === 'keep' ? 95 : settings.quality;
  return {
    blob: await encodeRaster(image, format, quality),
    width: image.width,
    height: image.height,
  };
}

/** The concrete raster format for an export format. */
export function resolveFormat(
  format: ExportSettings['format'],
  sourceType: string,
  transparent: () => boolean,
): RasterFormat {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    default:
      return sameFormat(sourceType, transparent());
  }
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

/** Letterbox onto a transparent square (keeping the aspect ratio) and wrap as ICO. */
async function encodeIco(image: Img, size: number): Promise<Encoded> {
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
  const png = new Uint8Array(
    await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
  );
  return {
    blob: new Blob([pngToIco(png, side)], { type: 'image/x-icon' }),
    width: side,
    height: side,
  };
}
