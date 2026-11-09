/** Convert to SVG: trace the image into vector shapes with VTracer (WASM). */

import wasmUrl from 'vtracer-wasm/vtracer.wasm?url';

import { p } from '../core/params';
import { restoreSize, tracerConfig } from '../core/vector';
import { readPixels, resized } from '../engine/canvas';
import { finalOp } from './op';

/** Smaller images are enlarged before tracing, up to 4×, for smoother curves. */
const TRACE_SIDE = 1000;

let tracer: Promise<typeof import('vtracer-wasm')> | undefined;

function loadTracer() {
  tracer ??= import('vtracer-wasm').then(async (module) => {
    await module.default({ module_or_path: wasmUrl });
    return module;
  });
  return tracer;
}

export const vectorize = finalOp({
  id: 'vectorize',
  kind: 'final',
  title: 'Convert to SVG',
  description:
    'Trace the image into scalable vector shapes: logos, icons, drawings.',
  suffix: 'vector',
  params: {
    colors: p.choice({
      label: 'Colors',
      default: 'color',
      options: [
        { value: 'color', label: 'Color' },
        { value: 'bw', label: 'Black & white' },
      ],
    }),
    detail: p.number({
      label: 'Color detail',
      default: 6,
      min: 1,
      max: 8,
      hint: 'Higher keeps more shades apart.',
      when: (v) => v.colors === 'color',
    }),
    speckle: p.number({
      label: 'Ignore specks smaller than',
      default: 4,
      min: 0,
      max: 64,
      unit: 'px',
    }),
    corners: p.choice({
      label: 'Corners',
      default: 'balanced',
      options: [
        { value: 'sharp', label: 'Sharp' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'round', label: 'Round' },
      ],
    }),
    curves: p.choice({
      label: 'Lines',
      default: 'spline',
      options: [
        { value: 'spline', label: 'Curves' },
        { value: 'polygon', label: 'Straight' },
      ],
    }),
  },
  async run(image, values) {
    const { to_svg } = await loadTracer();
    const factor = Math.min(
      4,
      Math.max(1, Math.floor(TRACE_SIDE / Math.max(image.width, image.height))),
    );
    const work =
      factor > 1
        ? resized(image, image.width * factor, image.height * factor)
        : image;
    const { data, width, height } = readPixels(work);
    const svg = to_svg(
      new Uint8Array(data.buffer),
      width,
      height,
      // Specks are measured on the original, so they scale with the enlargement.
      tracerConfig({ ...values, speckle: values.speckle * factor }),
    );
    return new Blob([restoreSize(svg, image, work)], { type: 'image/svg+xml' });
  },
});
