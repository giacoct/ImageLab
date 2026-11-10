/**
 * Decode an image file into the pipeline's canvas (in the working color
 * space, see `canvas.ts`). The browser's own decoder handles JPEG, PNG,
 * WebP, AVIF, GIF and BMP (and HEIC in Safari), applying the EXIF orientation
 * and the color profile; HEIC/HEIF elsewhere goes through libheif (WASM),
 * loaded only the first time it's needed.
 */

import { sniffType } from "../core/files";
import { context2d, createCanvas, type Img } from "./canvas";
import { colorSpaceOf } from "./color";

export interface Decoded {
  image: Img;
  /** The sniffed media type (e.g. `image/heic`), not necessarily the declared one. */
  type: string;
  bytes: Uint8Array;
}

/** The largest image the app accepts, in pixels (≈ a 100 MP photo). */
const MAX_PIXELS = 100_000_000;

export async function decode(blob: Blob): Promise<Decoded> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = sniffType(bytes, blob.type);

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type }), {
      imageOrientation: "from-image",
    });
  } catch {
    if (type !== "image/heic")
      throw new Error("This file is not an image the browser can open.");
  }

  if (bitmap) {
    checkSize(bitmap.width, bitmap.height);
    const image = createCanvas(bitmap.width, bitmap.height);
    context2d(image).drawImage(bitmap, 0, 0);
    bitmap.close();
    return { image, type, bytes };
  }
  return { image: await decodeHeic(bytes), type, bytes };
}

function checkSize(width: number, height: number): void {
  if (width * height > MAX_PIXELS) {
    throw new Error(
      `The image is too large (${width} × ${height} px; at most 100 megapixels).`,
    );
  }
}

// --- HEIC via libheif ----------------------------------------------------------

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(target: ImageData, done: (result: ImageData | null) => void): void;
  free(): void;
}

interface LibHeif {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
}

let libheif: Promise<LibHeif> | undefined;

function loadLibheif(): Promise<LibHeif> {
  libheif ??= import("libheif-js/libheif-wasm/libheif-bundle.mjs").then(
    async (module) => (await module.default()) as LibHeif,
  );
  return libheif;
}

async function decodeHeic(bytes: Uint8Array): Promise<Img> {
  const heif = await loadLibheif();
  const images = new heif.HeifDecoder().decode(bytes);
  if (images.length === 0) throw new Error("This HEIC file contains no image.");
  // The primary image is first; the rest are thumbnails/depth maps.
  const [primary] = images;
  try {
    const width = primary.get_width();
    const height = primary.get_height();
    checkSize(width, height);
    // libheif gives the file's own values: labelled with its color space,
    // the canvas converts them into the working one.
    const colorSpace = await colorSpaceOf(bytes);
    const data = new ImageData(width, height, { colorSpace });
    const result = await new Promise<ImageData | null>((resolve) =>
      primary.display(data, resolve),
    );
    if (!result) throw new Error("This HEIC photo could not be decoded.");
    const image = createCanvas(width, height);
    context2d(image).putImageData(result, 0, 0);
    return image;
  } finally {
    for (const image of images) image.free();
  }
}
