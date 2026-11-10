/**
 * Writing image files. JPEG, WebP and AVIF use Squoosh's codecs (WASM:
 * MozJPEG, libwebp, libavif), so the output is the same in every browser
 * (canvas encoders vary, and none writes AVIF); PNG uses the browser's own
 * lossless encoder. The codecs write bare files: the EXIF and the color
 * profile of an image in Display P3 are added to them (`core/embed.ts`).
 */

import { formatToWrite, type Encoding } from "../core/encoding";
import { DISPLAY_P3_CODES } from "../core/color";
import { embedMetadata } from "../core/embed";
import type { ImageFormat } from "../core/files";
import { tagNclx } from "../core/isobmff";
import { profileOf } from "../core/metadata";
import { hasTransparency } from "../core/pixels";
import { largestThatFits } from "../core/search";
import {
  flattened,
  inSrgb,
  readPixels,
  resized,
  workIn,
  workingSpace,
  type Img,
} from "./canvas";
import { displayP3Profile } from "./color";

export interface Encoded {
  blob: Blob;
  width: number;
  height: number;
  /** The quality it was written at (1–100), null for lossless PNG. */
  quality: number | null;
}

/**
 * An image while a tool works on it: its pixels, how it will be saved, and
 * the file it saves to, if that's already written: the input file
 * (`original`) until a tool changes the pixels, or the file Convert format,
 * Compress or Strip metadata wrote. A tool that changes the pixels drops it.
 */
export interface Picture {
  image: Img;
  encoding: Encoding;
  /** The EXIF the files written for it carry (`core/exif.ts`), if any. */
  exif: Uint8Array | null;
  file: {
    blob: Blob;
    original: boolean;
    /** The quality it was written at, when the app wrote it lossy. */
    quality?: number | null;
  } | null;
}

/** Encode `image` as `encoding` says, with `exif` in the file where the format takes it. */
export async function encodeImage(
  image: Img,
  encoding: Encoding,
  exif: Uint8Array | null = null,
): Promise<Encoded> {
  const format = formatToWrite(encoding, () =>
    hasTransparency(readPixels(image).data),
  );
  if (encoding.targetBytes !== null)
    return encodeToSize(image, format, encoding.targetBytes, exif);
  return {
    blob: await encodeRaster(image, format, encoding.quality, exif),
    width: image.width,
    height: image.height,
    quality: format === "image/png" ? null : Math.round(encoding.quality),
  };
}

/**
 * Save the picture as `encoding` says, right away (Convert format, Compress),
 * so its size is known. The pixels stay untouched: the next tool starts from
 * them, not from the compressed file.
 */
export async function write(
  picture: Picture,
  encoding: Encoding,
): Promise<Picture> {
  const { blob, quality } = await encodeImage(
    picture.image,
    encoding,
    picture.exif,
  );
  return { ...picture, encoding, file: { blob, original: false, quality } };
}

/** A lossless PNG of the image, which says its color space. */
export function losslessPng(image: Img): Promise<Blob> {
  return encodeRaster(image, "image/png", 100, null);
}

/**
 * Encode at `quality` (1–100; ignored by PNG), with `exif` unless it's AVIF.
 * An image in Display P3 says so: by its profile (the browser's PNG has it
 * already), or for AVIF by its color box. Where it can't, it's saved in
 * sRGB, so it doesn't look washed out.
 */
async function encodeRaster(
  image: Img,
  format: ImageFormat,
  quality: number,
  exif: Uint8Array | null,
): Promise<Blob> {
  const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
  const avif = format === "image/avif";
  let icc: Uint8Array | null = null;
  let file: Uint8Array;
  if (workingSpace() === "srgb") {
    file = await bytes(await encodeBare(image, format, quality));
  } else if (avif) {
    file = await bytes(await encodeBare(image, format, quality));
    const { primaries, transfer } = DISPLAY_P3_CODES;
    if (!tagNclx(file, primaries, transfer))
      file = await bytes(await encodeSrgb(image, format, quality));
  } else if ((icc = await displayP3Profile())) {
    file = await bytes(await encodeBare(image, format, quality));
    if (profileOf(file)) icc = null; // the browser's PNG
  } else file = await bytes(await encodeSrgb(image, format, quality));

  const carried = avif ? null : exif;
  const out =
    carried || icc ? embedMetadata(file, { exif: carried, icc }) : null;
  return new Blob([(out ?? file) as Uint8Array<ArrayBuffer>], { type: format });
}

/** Encode a copy in sRGB, for a file that can't say it's in Display P3. */
async function encodeSrgb(
  image: Img,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  const space = workingSpace();
  workIn("srgb");
  try {
    return await encodeBare(inSrgb(image), format, quality);
  } finally {
    workIn(space);
  }
}

async function encodeBare(
  image: Img,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  if (format === "image/png") return image.convertToBlob({ type: "image/png" });

  // JPEG has no alpha channel: flatten onto white instead of letting
  // transparent pixels turn black.
  const source = format === "image/jpeg" ? flattened(image) : image;
  const { image: data } = readPixels(source);
  const q = Math.round(Math.min(100, Math.max(1, quality)));
  let buffer: ArrayBuffer;
  switch (format) {
    case "image/jpeg": {
      const { default: encode } = await import("@jsquash/jpeg/encode");
      buffer = await encode(data, { quality: q });
      break;
    }
    case "image/webp": {
      const { default: encode } = await import("@jsquash/webp/encode");
      buffer = await encode(data, { quality: q, lossless: q === 100 ? 1 : 0 });
      break;
    }
    case "image/avif": {
      const { default: encode } = await import("@jsquash/avif/encode");
      buffer = await encode(data, {
        quality: q,
        lossless: q === 100,
        speed: 7,
      });
      break;
    }
  }
  return new Blob([buffer], { type: format });
}

/**
 * Fit a byte budget: binary-search the quality, or — for lossless PNG — the
 * dimensions. Returns the best result that fits, or the smallest one possible.
 */
function encodeToSize(
  image: Img,
  format: ImageFormat,
  targetBytes: number,
  exif: Uint8Array | null,
): Promise<Encoded> {
  if (format === "image/png") {
    return largestThatFits(
      async (scale) => {
        const scaled =
          scale >= 1
            ? image
            : resized(image, image.width * scale, image.height * scale);
        const blob = await encodeRaster(scaled, format, 100, exif);
        return {
          blob,
          width: scaled.width,
          height: scaled.height,
          quality: null,
          size: blob.size,
        };
      },
      targetBytes,
      0.05,
      1,
    );
  }
  return largestThatFits(
    async (quality) => {
      const blob = await encodeRaster(image, format, quality * 100, exif);
      return {
        blob,
        width: image.width,
        height: image.height,
        quality: Math.round(quality * 100),
        size: blob.size,
      };
    },
    targetBytes,
    0.05,
    0.95,
  );
}
