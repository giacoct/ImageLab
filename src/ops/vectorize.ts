import wasmUrl from 'vtracer-wasm/vtracer.wasm?url';

import { fitInside } from '../core/geometry';
import { p, type Values } from '../core/params';
import { hasTransparency, isFlatArt, medianFilter, modeFilter, quantize } from '../core/pixels';
import { restoreSize, tracerConfig, type TraceSettings } from '../core/vector';
import {
  downscaled,
  editPixels,
  fromPixels,
  readPixels,
  resized,
  type Img,
} from '../engine/canvas';
import { svgOp } from './op';

/** Curve fitting presets: rounder curves need higher corner and length thresholds. */
const SMOOTHNESS = {
  crisp: { cornerThreshold: 30, lengthThreshold: 4 },
  balanced: { cornerThreshold: 60, lengthThreshold: 4 },
  smooth: { cornerThreshold: 100, lengthThreshold: 6 },
} as const;

/** Flat art smaller than this is enlarged before tracing, for smoother curves. */
const FLAT_UPSCALE_BELOW = 600;
const FLAT_TARGET_SIDE = 1000;

const manual = (v: { preset?: unknown }) => v.preset === 'manual';

const PARAMS = {
  preset: p.choice({
    label: 'Settings',
    default: 'auto',
    options: [
      { value: 'auto', label: 'Automatic' },
      { value: 'manual', label: 'Manual' },
    ],
    hint: 'Automatic tells logos from photos and prepares each accordingly.',
  }),
  colorPrecision: p.number({ label: 'Color detail', default: 6, min: 1, max: 8, when: manual }),
  filterSpeckle: p.number({
    label: 'Speckle cleanup',
    default: 10,
    min: 0,
    max: 64,
    unit: 'px',
    when: manual,
  }),
  mode: p.choice({
    label: 'Curves',
    default: 'spline',
    options: [
      { value: 'spline', label: 'Smooth splines' },
      { value: 'polygon', label: 'Straight polygons' },
    ],
    when: manual,
  }),
  smoothness: p.choice({
    label: 'Corners',
    default: 'balanced',
    options: [
      { value: 'crisp', label: 'Crisp' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'smooth', label: 'Rounded' },
    ],
    when: manual,
  }),
};

let tracer: Promise<typeof import('vtracer-wasm')> | undefined;

function loadTracer() {
  tracer ??= import('vtracer-wasm').then(async (module) => {
    await module.default({ module_or_path: wasmUrl });
    return module;
  });
  return tracer;
}

async function trace(image: Img, settings: TraceSettings): Promise<string> {
  const { to_svg } = await loadTracer();
  const { data, width, height } = readPixels(image);
  return to_svg(new Uint8Array(data.buffer), width, height, tracerConfig(settings));
}

/**
 * Pick settings and clean the image up for tracing. Flat art (logos,
 * illustrations) is enlarged and its anti-aliasing flattened into clean
 * regions; photos get noise suppression and harder layer merging.
 */
async function traceAuto(image: Img): Promise<string> {
  const original = { width: image.width, height: image.height };
  const thumbSize = fitInside(image, { width: 128, height: 128 });
  const flat = isFlatArt(readPixels(downscaled(image, thumbSize.width, thumbSize.height)).data);
  const transparent = hasTransparency(readPixels(image).data);

  const longest = Math.max(image.width, image.height);
  const factor =
    flat && longest < FLAT_UPSCALE_BELOW
      ? Math.min(4, Math.max(1, Math.round(FLAT_TARGET_SIDE / longest)))
      : 1;
  let work = factor > 1 ? resized(image, image.width * factor, image.height * factor) : image;

  if (flat && !transparent) {
    const pixels = readPixels(work);
    work = fromPixels(modeFilter(pixels, 5), pixels.width, pixels.height);
    editPixels(work, (p) => quantize(p.data, 16));
  } else if (!flat) {
    const pixels = readPixels(work);
    work = fromPixels(medianFilter(pixels, 3), pixels.width, pixels.height);
  }

  const svg = await trace(work, {
    mode: 'spline',
    // Strong speckle cleanup, scaled with the enlargement so it removes the
    // same real-world detail size.
    filterSpeckle: Math.min(64, flat ? 8 * factor : 10),
    colorPrecision: 6,
    layerDifference: flat ? 16 : 28,
    cornerThreshold: 60,
    lengthThreshold: 4,
    pathPrecision: factor > 1 ? 2 : 3,
  });
  return restoreSize(svg, original, work);
}

function manualSettings(values: Values<typeof PARAMS>): TraceSettings {
  return {
    mode: values.mode,
    colorPrecision: values.colorPrecision,
    filterSpeckle: values.filterSpeckle,
    layerDifference: 16,
    ...SMOOTHNESS[values.smoothness],
    pathPrecision: 3,
  };
}

export const vectorize = svgOp({
  id: 'vectorize',
  kind: 'svg',
  title: 'Convert to SVG',
  description: 'Trace the image into scalable vector shapes (VTracer).',
  icon: 'vector',
  suffix: 'vector',
  heavy: true,
  params: PARAMS,
  run(image, values) {
    return values.preset === 'auto' ? traceAuto(image) : trace(image, manualSettings(values));
  },
});
