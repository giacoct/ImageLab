/**
 * Runs chains of steps inside the engine worker: full-size processing of one
 * file (`processFile`) and downscaled live previews (`renderPreview`), with
 * the same operations. Each image moves through the steps as a `Picture`.
 */

import { initialEncoding } from '../core/encoding';
import { extensionFor, outputName, type ImageFormat } from '../core/files';
import { downscaleFactor } from '../core/geometry';
import { getOp } from '../ops';
import type { RunContext, Step } from '../ops/op';
import { downscaled, type Img } from './canvas';
import { decode } from './decode';
import { encodeImage, type Picture } from './encode';

export interface Output {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  /** A small WebP for the results list, which would otherwise decode every file at full size. */
  thumbnail: Blob;
}

/** Longest side of the thumbnails: small in the file list, larger in the results. */
const THUMBNAIL_SIDE = { file: 160, result: 480 };

async function runSteps(picture: Picture, steps: readonly Step[], context: RunContext) {
  for (const step of steps) {
    const op = getOp(step.op);
    picture =
      op.kind === 'map'
        ? // New pixels: no file holds them yet.
          { ...picture, image: await op.run(picture.image, step.params, context), file: null }
        : await op.run(picture, step.params, context);
  }
  return picture;
}

/** Run the chain on one file at full size and write the result. */
export async function processFile(
  input: { name: string; blob: Blob },
  steps: Step[],
  context: RunContext,
): Promise<Output> {
  if (steps.length === 0) throw new Error('Add a step first.');
  const { image, type } = await decode(input.blob);
  const result = await runSteps(
    { image, encoding: initialEncoding(type), file: null },
    steps,
    context,
  );
  // The file Convert format or Compress wrote, unless a later step changed the pixels.
  const saved = result.file
    ? { blob: result.file, width: result.image.width, height: result.image.height }
    : await encodeImage(result.image, result.encoding);
  const suffix = getOp(steps[steps.length - 1].op).suffix;
  return {
    name: outputName(input.name, suffix, extensionFor(saved.blob.type as ImageFormat)),
    ...saved,
    thumbnail: await thumbnailOf(result.image, THUMBNAIL_SIDE.result),
  };
}

/** A small WebP of the image, its longest side at most `maxSide`. */
function thumbnailOf(image: Img, maxSide: number): Promise<Blob> {
  const factor = downscaleFactor(image, maxSide);
  const small = downscaled(image, image.width * factor, image.height * factor);
  return small.convertToBlob({ type: 'image/webp', quality: 0.8 });
}

// --- inspection ----------------------------------------------------------------

export interface Inspection {
  width: number;
  height: number;
  /** The sniffed type, which may differ from the declared one. */
  type: string;
  thumbnail: Blob;
}

/** Size, real type and a small thumbnail (also for HEIC, which `<img>` can't show). */
export async function inspect(blob: Blob): Promise<Inspection> {
  const { image, type } = await decode(blob);
  return {
    width: image.width,
    height: image.height,
    type,
    thumbnail: await thumbnailOf(image, THUMBNAIL_SIDE.file),
  };
}

// --- preview -------------------------------------------------------------------

export interface PreviewRequest {
  /** Stable id of the file, used to cache its downscaled copy. */
  key: string;
  blob: Blob;
  steps: Step[];
  /** Longest side of the rendered preview, in pixels. */
  maxSide: number;
}

interface Proxy {
  image: Img;
  /** The file's type, which decides how the image is saved. */
  type: string;
  /** Proxy size / original size. */
  scale: number;
}

/**
 * Previews start from a downscaled copy of each file, decoded once at the
 * largest size a preview shows; smaller previews are derived from it. The
 * most recently used copies are kept.
 */
const PROXY_SIDE = 1600;
const PROXY_CACHE = 8;
const proxies = new Map<string, Promise<Proxy>>();

function proxyFor(key: string, blob: Blob): Promise<Proxy> {
  let proxy = proxies.get(key);
  if (proxy) {
    proxies.delete(key); // re-inserted below: most recently used last
  } else {
    proxy = decode(blob).then(({ image, type }) => {
      const scale = downscaleFactor(image, PROXY_SIDE);
      return {
        image: scale < 1 ? downscaled(image, image.width * scale, image.height * scale) : image,
        type,
        scale,
      };
    });
    proxy.catch(() => proxies.delete(key));
  }
  proxies.set(key, proxy);
  if (proxies.size > PROXY_CACHE) proxies.delete(proxies.keys().next().value!);
  return proxy;
}

/** Render the chain on a downscaled copy of the file, at most `maxSide` px. */
export async function renderPreview(request: PreviewRequest): Promise<Img> {
  const proxy = await proxyFor(request.key, request.blob);
  const factor = downscaleFactor(proxy.image, request.maxSide);
  // Operations may edit their input in place: always start from a fresh copy.
  const copy = downscaled(proxy.image, proxy.image.width * factor, proxy.image.height * factor);
  const picture = { image: copy, encoding: initialEncoding(proxy.type), file: null };
  const result = await runSteps(picture, request.steps, { scale: proxy.scale * factor });
  return result.image;
}
