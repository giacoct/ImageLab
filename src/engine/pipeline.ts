/**
 * Runs recipes inside the engine worker: full-size exports (`processJob`) and
 * downscaled live previews (`renderPreview`), with the same operations.
 */

import { extensionFor, outputName, type OutputType } from '../core/files';
import { downscaleFactor } from '../core/geometry';
import { inspectMetadata, stripMetadata, type MetadataSummary } from '../core/metadata';
import type { OcrPage } from '../core/ocr';
import type { ExportSettings, Step } from '../core/recipe';
import { getOp } from '../ops';
import { stopsPreview, type Op, type RunContext } from '../ops/op';
import { downscaled, type Img } from './canvas';
import { decode } from './decode';
import { encodeImage } from './encode';

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
  /** A small WebP for the results list, which would otherwise decode every file at full size. */
  thumbnail: Blob;
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

/** Longest side of the thumbnails: small in the file list, larger in the results. */
const THUMBNAIL_SIDE = { file: 160, result: 480 };

interface Resolved {
  op: Op;
  values: Record<string, unknown>;
}

type StageResult =
  | { kind: 'image'; image: Img }
  | { kind: 'svg'; image: Img; svg: string }
  | { kind: 'text'; image: Img; page: OcrPage };

function resolve(steps: readonly Step[]): Resolved[] {
  return steps.map((step) => ({ op: getOp(step.op), values: step.params }));
}

/**
 * Process one job: a single file, or — when the recipe merges — all files
 * into one output. Steps before a merge apply to each file separately.
 */
export async function processJob(
  inputs: Input[],
  recipe: JobRecipe,
  context: RunContext,
): Promise<Output[]> {
  const ops = resolve(recipe.steps);
  const suffix = recipe.suffix ?? ops.at(-1)?.op.suffix ?? 'converted';
  const outputs: Output[] = [];

  if (ops.length === 0 && recipe.export.format === 'keep') {
    for (const input of inputs) outputs.push(await keepFile(input, recipe.export, suffix));
    return outputs;
  }

  const combineAt = ops.findIndex(({ op }) => op.kind === 'combine');
  if (combineAt === -1) {
    for (const input of inputs) {
      const { image, type } = await decode(input.blob);
      const result = await runStage(image, ops, context);
      outputs.push(await finish(result, input.name, type, recipe.export, suffix));
    }
    return outputs;
  }

  let firstType = '';
  const loaders = inputs.map((input) => async () => {
    const { image, type } = await decode(input.blob);
    firstType ||= type;
    return image;
  });
  const result = await runMerge(loaders, ops, combineAt, context);
  return [await finish(result, inputs[0].name, firstType, recipe.export, suffix)];
}

/**
 * Load the images one by one, running the steps before the merge on each
 * right away (so the full-size originals don't all wait in memory), combine
 * them, and run the remaining steps on the result.
 */
async function runMerge(
  loaders: (() => Promise<Img>)[],
  ops: Resolved[],
  combineAt: number,
  context: RunContext,
): Promise<StageResult> {
  const { op, values } = ops[combineAt];
  if (op.kind !== 'combine') throw new Error(`${op.title} is not a combining step.`);
  if (loaders.length < op.minInputs) {
    throw new Error(`${op.title} needs at least ${op.minInputs} images.`);
  }
  const before = ops.slice(0, combineAt);
  const images: Img[] = [];
  for (const load of loaders) images.push(asImage(await runStage(await load(), before, context)));
  const combined = await op.run(images, values, context);
  return runStage(combined, ops.slice(combineAt + 1), context);
}

/** Run map steps, ending at a terminal (SVG/text) step if there is one. */
async function runStage(image: Img, ops: Resolved[], context: RunContext): Promise<StageResult> {
  let current = image;
  for (const [index, { op, values }] of ops.entries()) {
    switch (op.kind) {
      case 'map':
        current = await op.run(current, values, context);
        break;
      case 'svg':
      case 'text':
        if (index !== ops.length - 1) throw new Error(`${op.title} must be the last step.`);
        return op.kind === 'svg'
          ? { kind: 'svg', image: current, svg: await op.run(current, values, context) }
          : { kind: 'text', image: current, page: await op.run(current, values, context) };
      case 'combine':
        throw new Error(`${op.title} can only appear once.`);
    }
  }
  return { kind: 'image', image: current };
}

function asImage(result: StageResult): Img {
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
  const thumbnail = await thumbnailOf(image, THUMBNAIL_SIDE.result);
  switch (result.kind) {
    case 'svg':
      return {
        name: outputName(inputName, suffix, 'svg'),
        blob: new Blob([result.svg], { type: 'image/svg+xml' }),
        width: image.width,
        height: image.height,
        thumbnail,
      };
    case 'text':
      return {
        name: outputName(inputName, suffix, 'txt'),
        blob: new Blob([result.page.text], { type: 'text/plain;charset=utf-8' }),
        width: image.width,
        height: image.height,
        thumbnail,
        // Only shown on screen: the browser's own encoder is quick and good enough.
        display: await image.convertToBlob({ type: 'image/webp', quality: 0.85 }),
        ocr: result.page,
      };
    case 'image': {
      const encoded = await encodeImage(image, settings, sourceType);
      return {
        name: outputName(inputName, suffix, extensionFor(encoded.blob.type as OutputType)),
        ...encoded,
        thumbnail,
      };
    }
  }
}

/**
 * "Original file, metadata removed": drop the metadata without touching the
 * image data when the format allows, otherwise re-encode near-losslessly.
 */
async function keepFile(input: Input, settings: ExportSettings, suffix: string): Promise<Output> {
  const { image, type, bytes } = await decode(input.blob);
  const stripped = stripMetadata(bytes, type);
  if (!stripped) return finish({ kind: 'image', image }, input.name, type, settings, suffix);
  return {
    name: outputName(input.name, suffix, extensionFor(type as OutputType)),
    blob: new Blob([stripped], { type }),
    width: image.width,
    height: image.height,
    thumbnail: await thumbnailOf(image, THUMBNAIL_SIDE.result),
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
  type: string;
  thumbnail: Blob;
  metadata: MetadataSummary;
}

/** Size, real type, metadata and a small thumbnail (also for HEIC, which `<img>` can't show). */
export async function inspect(blob: Blob): Promise<Inspection> {
  const { image, type, bytes } = await decode(blob);
  return {
    width: image.width,
    height: image.height,
    type,
    thumbnail: await thumbnailOf(image, THUMBNAIL_SIDE.file),
    metadata: inspectMetadata(bytes, type),
  };
}

// --- preview -------------------------------------------------------------------

export interface PreviewFile {
  /** Stable id of the file, used to cache its downscaled copy. */
  key: string;
  blob: Blob;
}

export interface PreviewRequest {
  files: PreviewFile[];
  /** The file shown, unless the steps merge them all. */
  selected: number;
  steps: Step[];
  /** Longest side of the rendered preview, in pixels. */
  maxSide: number;
}

interface Proxy {
  image: Img;
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

function proxyFor(file: PreviewFile): Promise<Proxy> {
  let proxy = proxies.get(file.key);
  if (proxy) {
    proxies.delete(file.key); // re-inserted below: most recently used last
  } else {
    proxy = decode(file.blob).then(({ image }) => {
      const scale = downscaleFactor(image, PROXY_SIDE);
      return {
        image: scale < 1 ? downscaled(image, image.width * scale, image.height * scale) : image,
        scale,
      };
    });
    proxy.catch(() => proxies.delete(file.key));
  }
  proxies.set(file.key, proxy);
  if (proxies.size > PROXY_CACHE) proxies.delete(proxies.keys().next().value!);
  return proxy;
}

/**
 * Render the preview: the steps before the first slow or terminal one, on
 * the selected file (or all of them when the steps merge), at most
 * `maxSide` px.
 */
export async function renderPreview(
  request: PreviewRequest,
  asset: RunContext['asset'],
): Promise<Img> {
  const { files, selected, maxSide } = request;
  const all = resolve(request.steps);
  const stop = all.findIndex(({ op }) => stopsPreview(op));
  const ops = stop === -1 ? all : all.slice(0, stop);
  const combineAt = ops.findIndex(({ op }) => op.kind === 'combine');

  // Operations may edit their input in place, so each run gets a fresh copy
  // of the cached proxy (made at the size it needs).
  if (combineAt === -1) {
    const proxy = await proxyFor(files[selected]);
    const factor = downscaleFactor(proxy.image, maxSide);
    const copy = downscaled(proxy.image, proxy.image.width * factor, proxy.image.height * factor);
    return asImage(await runStage(copy, ops, { scale: proxy.scale * factor, asset }));
  }

  // Merging: bring every image to one common scale so their relative sizes
  // hold, smaller still with many images so the combined preview stays light.
  const loaded = await Promise.all(files.map(proxyFor));
  const scale =
    Math.min(...loaded.map((proxy) => proxy.scale * downscaleFactor(proxy.image, maxSide))) /
    Math.max(1, files.length / 2);
  const loaders = loaded.map((proxy) => async () => {
    const factor = scale / proxy.scale;
    return downscaled(proxy.image, proxy.image.width * factor, proxy.image.height * factor);
  });
  return asImage(await runMerge(loaders, ops, combineAt, { scale, asset }));
}
