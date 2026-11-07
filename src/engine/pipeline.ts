/**
 * Runs recipes inside the engine worker: full-size exports (`processJob`) and
 * downscaled live previews (`renderPreview`), with the same operations.
 */

import { extensionFor, outputName, type OutputType } from '../core/files';
import { downscaleFactor } from '../core/geometry';
import { inspectMetadata, stripMetadata } from '../core/metadata';
import type { OcrPage } from '../core/ocr';
import type { ExportSettings, Step } from '../core/recipe';
import { getOp } from '../ops';
import type { Op, RunContext } from '../ops/op';
import { downscaled, resized, type Img } from './canvas';
import { decode } from './decode';
import { encodeImage, encodeRaster } from './encode';

export interface Input {
  name: string;
  blob: Blob;
}

export interface Output {
  name: string;
  /** The produced file (image, SVG, or text). */
  blob: Blob;
  width: number;
  height: number;
  /** For text results: the image the text was read from, for the overlay. */
  display?: Blob;
  ocr?: OcrPage;
}

export interface JobRecipe {
  steps: Step[];
  export: ExportSettings;
  /** Output name suffix; defaults to the last step's. */
  suffix?: string;
}

interface Resolved {
  op: Op;
  values: Record<string, unknown>;
}

type StageResult =
  | { kind: 'image'; image: Img }
  | { kind: 'svg'; image: Img; svg: string }
  | { kind: 'text'; image: Img; page: OcrPage };

/**
 * Process one job: a single file, or — when the recipe merges — all files
 * into one output. Steps before a merge apply to each file separately.
 */
export async function processJob(
  inputs: Input[],
  recipe: JobRecipe,
  context: RunContext,
): Promise<Output[]> {
  const ops = recipe.steps.map((step): Resolved => ({ op: getOp(step.op), values: step.params }));
  const suffix = recipe.suffix ?? ops.at(-1)?.op.suffix ?? 'converted';

  if (ops.length === 0 && recipe.export.format === 'keep') {
    const outputs: Output[] = [];
    for (const input of inputs) outputs.push(await keepFile(input, recipe.export, suffix));
    return outputs;
  }

  const combineAt = ops.findIndex(({ op }) => op.kind === 'combine');
  if (combineAt === -1) {
    const outputs: Output[] = [];
    for (const input of inputs) {
      const { image, type } = await decode(input.blob);
      const result = await runStage(image, ops, context);
      outputs.push(await finish(result, input.name, type, recipe.export, suffix));
    }
    return outputs;
  }

  // Merge: run the steps before it on each image, combine, then the rest.
  const images: Img[] = [];
  let firstType = '';
  for (const input of inputs) {
    const { image, type } = await decode(input.blob);
    firstType ||= type;
    images.push(await runImageStage(image, ops.slice(0, combineAt), context));
  }
  const combined = await runCombine(images, ops[combineAt], context);
  const result = await runStage(combined, ops.slice(combineAt + 1), context);
  return [await finish(result, inputs[0].name, firstType, recipe.export, suffix)];
}

async function runCombine(
  images: Img[],
  { op, values }: Resolved,
  context: RunContext,
): Promise<Img> {
  if (op.kind !== 'combine') throw new Error(`${op.title} is not a combining step.`);
  if (images.length < op.minInputs) {
    throw new Error(`${op.title} needs at least ${op.minInputs} images.`);
  }
  return op.run(images, values, context);
}

/** Run map steps, ending at a terminal (SVG/text) step if there is one. */
async function runStage(image: Img, ops: Resolved[], context: RunContext): Promise<StageResult> {
  let current = image;
  for (const [index, { op, values }] of ops.entries()) {
    const isLast = index === ops.length - 1;
    switch (op.kind) {
      case 'map':
        current = await op.run(current, values, context);
        break;
      case 'svg':
      case 'text':
        if (!isLast) throw new Error(`${op.title} must be the last step.`);
        return op.kind === 'svg'
          ? { kind: 'svg', image: current, svg: await op.run(current, values, context) }
          : { kind: 'text', image: current, page: await op.run(current, values, context) };
      case 'combine':
        throw new Error(`${op.title} can only appear once.`);
    }
  }
  return { kind: 'image', image: current };
}

async function runImageStage(image: Img, ops: Resolved[], context: RunContext): Promise<Img> {
  const result = await runStage(image, ops, context);
  if (result.kind !== 'image') throw new Error('Text and SVG steps must come last.');
  return result.image;
}

async function finish(
  result: StageResult,
  inputName: string,
  sourceType: string,
  settings: ExportSettings,
  suffix: string,
): Promise<Output> {
  const { image } = result;
  if (result.kind === 'svg') {
    return {
      name: outputName(inputName, suffix, 'svg'),
      blob: new Blob([result.svg], { type: 'image/svg+xml' }),
      width: image.width,
      height: image.height,
    };
  }
  if (result.kind === 'text') {
    return {
      name: outputName(inputName, suffix, 'txt'),
      blob: new Blob([result.page.text], { type: 'text/plain;charset=utf-8' }),
      width: image.width,
      height: image.height,
      display: await encodeRaster(image, 'image/webp', 85),
      ocr: result.page,
    };
  }
  const encoded = await encodeImage(image, settings, sourceType);
  return {
    name: outputName(inputName, suffix, extensionFor(encoded.blob.type as OutputType)),
    ...encoded,
  };
}

/**
 * "Original file, metadata removed": drop the metadata without touching the
 * image data when the format allows, otherwise re-encode near-losslessly.
 */
async function keepFile(input: Input, settings: ExportSettings, suffix: string): Promise<Output> {
  const { image, type, bytes } = await decode(input.blob);
  const stripped = stripMetadata(bytes, type);
  if (stripped) {
    return {
      name: outputName(input.name, suffix, extensionFor(type as OutputType)),
      blob: new Blob([stripped.slice()], { type }),
      width: image.width,
      height: image.height,
    };
  }
  return finish({ kind: 'image', image }, input.name, type, settings, suffix);
}

// --- inspection ----------------------------------------------------------------

export interface Inspection {
  width: number;
  height: number;
  type: string;
  thumbnail: Blob;
  metadata: ReturnType<typeof inspectMetadata>;
}

const THUMBNAIL_SIDE = 160;

/** Size, real type, metadata and a small thumbnail (also for HEIC, which `<img>` can't show). */
export async function inspect(blob: Blob): Promise<Inspection> {
  const { image, type, bytes } = await decode(blob);
  const scale = downscaleFactor(image, THUMBNAIL_SIDE * 2);
  const thumb = downscaled(image, image.width * scale, image.height * scale);
  return {
    width: image.width,
    height: image.height,
    type,
    thumbnail: await thumb.convertToBlob({ type: 'image/webp', quality: 0.8 }),
    metadata: inspectMetadata(bytes, type),
  };
}

// --- preview -------------------------------------------------------------------

export interface PreviewFile {
  /** Stable id of the file, used to cache its downscaled copy. */
  key: string;
  blob: Blob;
}

interface Proxy {
  image: Img;
  /** Proxy size / original size. */
  scale: number;
}

const proxies = new Map<string, Promise<Proxy>>();
const PROXY_CACHE = 8;

/** A cached downscaled copy of the file (longest side `maxSide`). */
function proxyFor(file: PreviewFile, maxSide: number): Promise<Proxy> {
  const key = `${file.key}@${maxSide}`;
  let proxy = proxies.get(key);
  if (!proxy) {
    proxy = decode(file.blob).then(({ image }) => {
      const scale = downscaleFactor(image, maxSide);
      return {
        image: scale < 1 ? downscaled(image, image.width * scale, image.height * scale) : image,
        scale,
      };
    });
    proxy.catch(() => proxies.delete(key));
    proxies.set(key, proxy);
    if (proxies.size > PROXY_CACHE) proxies.delete(proxies.keys().next().value!);
  } else {
    // Refresh its position in the LRU order.
    proxies.delete(key);
    proxies.set(key, proxy);
  }
  return proxy;
}

/** The steps a live preview runs: everything before the first slow (ML) step. */
export function previewableSteps(steps: readonly Step[]): Step[] {
  const stop = steps.findIndex((step) => {
    const op = getOp(step.op);
    return op.heavy || op.kind === 'svg' || op.kind === 'text';
  });
  return stop === -1 ? [...steps] : steps.slice(0, stop);
}

/**
 * Render the preview of `steps` (only the previewable ones) for `files[selected]`
 * — or for all files when the steps merge them — at most `maxSide` px.
 */
export async function renderPreview(
  files: PreviewFile[],
  selected: number,
  steps: Step[],
  maxSide: number,
  asset: RunContext['asset'],
): Promise<Img> {
  const ops = previewableSteps(steps).map((step): Resolved => ({
    op: getOp(step.op),
    values: step.params,
  }));
  const combineAt = ops.findIndex(({ op }) => op.kind === 'combine');

  if (combineAt === -1) {
    const proxy = await proxyFor(files[selected], maxSide);
    // Operations may edit their input in place: never hand them the cached copy.
    const copy = resized(proxy.image, proxy.image.width, proxy.image.height);
    return runImageStage(copy, ops, { scale: proxy.scale, asset });
  }

  // Merging: bring every image to one common scale so their relative sizes hold.
  const loaded = await Promise.all(files.map((file) => proxyFor(file, maxSide)));
  const scale = Math.min(...loaded.map((proxy) => proxy.scale)) / Math.max(1, files.length / 2);
  const context = { scale, asset };
  const images: Img[] = [];
  for (const proxy of loaded) {
    const factor = scale / proxy.scale;
    const copy = resized(proxy.image, proxy.image.width * factor, proxy.image.height * factor);
    images.push(await runImageStage(copy, ops.slice(0, combineAt), context));
  }
  const combined = await runCombine(images, ops[combineAt], context);
  return runImageStage(combined, ops.slice(combineAt + 1), context);
}
