/**
 * Runs chains of steps inside the engine worker: full-size processing
 * (`processJob`) and downscaled live previews (`renderPreview`), with the same
 * operations. Each image moves through the steps as a `Picture`; a combining
 * step (Merge images) turns them all into one, and a final step (OCR, SVG)
 * ends the chain with a file of another kind.
 */

import { initialEncoding } from '../core/encoding';
import { extensionFor, outputName, type ImageFormat } from '../core/files';
import { downscaleFactor } from '../core/geometry';
import { readMetadata } from '../core/metadata';
import { getOp } from '../ops';
import type { Op, RunContext, Step } from '../ops/op';
import { downscaled, type Img } from './canvas';
import { decode } from './decode';
import { encodeImage, type Picture } from './encode';

export interface Input {
  name: string;
  blob: Blob;
}

export interface Output {
  name: string;
  /** The produced file: an image, an SVG, or text. */
  blob: Blob;
  width: number;
  height: number;
  /** For the results list: a small WebP of the image, or the SVG itself. */
  thumbnail: Blob;
  /** The recognized text, for OCR results. */
  text?: string;
}

/** Longest side of the thumbnails: small in the file list, larger in the results. */
const THUMBNAIL_SIDE = { file: 160, result: 480 };

const EXTENSIONS: Record<string, string> = { 'image/svg+xml': 'svg', 'text/plain': 'txt' };

/** The steps, checked: a final step (OCR, SVG) can only be the last one. */
function resolve(steps: readonly Step[]): { op: Op; values: Step['params'] }[] {
  const resolved = steps.map((step) => ({ op: getOp(step.op), values: step.params }));
  const misplaced = resolved.findIndex(({ op }, i) => op.kind === 'final' && i < steps.length - 1);
  if (misplaced !== -1) throw new Error(`${resolved[misplaced].op.title} must be the last step.`);
  return resolved;
}

/**
 * Run the image steps of a chain. Each image is loaded and taken through the
 * steps before the first merge on its own, so the full-size originals don't
 * all wait in memory; from the merge on there is one image.
 */
async function runImages(
  loaders: (() => Promise<Picture>)[],
  steps: ReturnType<typeof resolve>,
  context: RunContext,
): Promise<Picture[]> {
  const split = steps.findIndex(({ op }) => op.kind === 'combine');
  const [before, after] = split === -1 ? [steps, []] : [steps.slice(0, split), steps.slice(split)];

  let pictures: Picture[] = [];
  for (const load of loaders) pictures.push(await runSteps(await load(), before, context));
  for (const { op, values } of after) {
    if (op.kind === 'combine') {
      const image = await op.run(
        pictures.map((picture) => picture.image),
        values,
        context,
      );
      pictures = [{ image, encoding: pictures[0].encoding, file: null }];
    } else {
      pictures = [await runSteps(pictures[0], [{ op, values }], context)];
    }
  }
  return pictures;
}

/** Run map and file steps on one picture (other kinds are handled by the caller). */
async function runSteps(
  picture: Picture,
  steps: ReturnType<typeof resolve>,
  context: RunContext,
): Promise<Picture> {
  for (const { op, values } of steps) {
    if (op.kind === 'map') {
      // New pixels: no file holds them yet.
      picture = { ...picture, image: await op.run(picture.image, values, context), file: null };
    } else if (op.kind === 'file') {
      picture = await op.run(picture, values, context);
    }
  }
  return picture;
}

/** An input file, decoded; until a step changes the pixels, the file itself holds them. */
async function load(input: Input): Promise<Picture> {
  const { image, type } = await decode(input.blob);
  // Labelled with the sniffed type: the declared one may be missing or wrong.
  const file = { blob: new Blob([input.blob], { type }), original: true };
  return { image, encoding: initialEncoding(type), file };
}

/**
 * Process one job at full size: a single file, or all of them when the chain
 * merges. Outputs are named after their input (the first one for a merge)
 * and the last step.
 */
export async function processJob(
  inputs: Input[],
  steps: Step[],
  context: RunContext,
): Promise<Output[]> {
  const resolved = resolve(steps);
  if (resolved.length === 0) throw new Error('Add a step first.');
  const last = resolved[resolved.length - 1];
  const imageSteps = last.op.kind === 'final' ? resolved.slice(0, -1) : resolved;
  const pictures = await runImages(
    inputs.map((input) => () => load(input)),
    imageSteps,
    context,
  );

  return Promise.all(
    pictures.map(async ({ image, encoding, file }, i): Promise<Output> => {
      const size = { width: image.width, height: image.height };
      let output: Pick<Output, 'blob' | 'thumbnail' | 'text'> & Partial<Output>;
      if (last.op.kind === 'final') {
        const blob = await last.op.run(image, last.values, context);
        const isText = blob.type.startsWith('text/');
        output = {
          blob,
          thumbnail: isText ? await thumbnailOf(image, THUMBNAIL_SIDE.result) : blob,
          text: isText ? await blob.text() : undefined,
        };
      } else {
        // The file a step already wrote, unless a later step changed the pixels.
        const saved = file ? { blob: file.blob, ...size } : await encodeImage(image, encoding);
        output = { ...saved, thumbnail: await thumbnailOf(image, THUMBNAIL_SIDE.result) };
      }
      const type = output.blob.type.split(';')[0];
      const extension = EXTENSIONS[type] ?? extensionFor(type as ImageFormat);
      return {
        ...size,
        ...output,
        name: outputName(inputs[i].name, last.op.suffix, extension),
      };
    }),
  );
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
  /** The metadata the file embeds, in words. */
  metadata: string[];
}

/** Size, real type, metadata and a small thumbnail (also for HEIC, which `<img>` can't show). */
export async function inspect(blob: Blob): Promise<Inspection> {
  const { image, type, bytes } = await decode(blob);
  return {
    width: image.width,
    height: image.height,
    type,
    thumbnail: await thumbnailOf(image, THUMBNAIL_SIDE.file),
    metadata: readMetadata(bytes).found,
  };
}

// --- preview -------------------------------------------------------------------

export interface PreviewRequest {
  /** The files shown: the selected one, or all of them when the chain merges. */
  files: {
    /** Stable id of the file, used to cache its downscaled copy. */
    key: string;
    blob: Blob;
  }[];
  /** The steps to show; final steps (OCR, SVG) are left out by the caller. */
  steps: Step[];
  /** Longest side of each image in the preview, in pixels. */
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
const PROXY_CACHE = 12;
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

/**
 * Render the chain on downscaled copies of the files. All of them share one
 * scale, so a merge keeps their relative sizes; it's smaller with many files,
 * so a merged preview stays light.
 */
export async function renderPreview(
  request: PreviewRequest,
  asset: RunContext['asset'],
): Promise<Img> {
  const loaded = await Promise.all(request.files.map((file) => proxyFor(file.key, file.blob)));
  const scale =
    Math.min(
      ...loaded.map((proxy) => proxy.scale * downscaleFactor(proxy.image, request.maxSide)),
    ) / Math.max(1, Math.sqrt(loaded.length));
  // Operations may edit their input in place: each run starts from fresh copies.
  const loaders = loaded.map((proxy) => async (): Promise<Picture> => {
    const factor = scale / proxy.scale;
    const image = downscaled(proxy.image, proxy.image.width * factor, proxy.image.height * factor);
    return { image, encoding: initialEncoding(proxy.type), file: null };
  });
  const [result] = await runImages(loaders, resolve(request.steps), { scale, asset });
  return result.image;
}
