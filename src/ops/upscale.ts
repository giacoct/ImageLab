import type { InferenceSession } from 'onnxruntime-web';

import { hasTransparency } from '../core/pixels';
import { context2d, createCanvas, readPixels, resized } from '../engine/canvas';
import { mapOp } from './op';

/** Native scale factor of the model. */
export const UPSCALE_FACTOR = 4;

/**
 * Longest input side. Bounds time and memory: a 1500 px input becomes a
 * 6000 px (144 MB) result, which a phone can still hold.
 */
export const MAX_UPSCALE_SIDE = 1500;

/**
 * The image goes through the model in overlapping tiles so memory stays
 * bounded; the padding gives the model context across seams and is cropped
 * off the upscaled tile.
 */
const TILE = 256;
const TILE_PAD = 16;

const MODEL = 'models/realesr-general-x4v3.onnx';

function tooLarge(size: { width: number; height: number }): string | null {
  return Math.max(size.width, size.height) > MAX_UPSCALE_SIDE
    ? `Too large to upscale (${size.width} × ${size.height} px); the longest side can be at most ${MAX_UPSCALE_SIDE} px.`
    : null;
}

interface Model {
  ort: typeof import('onnxruntime-web/webgpu');
  session: InferenceSession;
}

let model: Promise<Model> | undefined;

/** Load onnxruntime and the model once per worker; WebGPU when available, else WASM (CPU). */
function loadModel(asset: (path: string) => string): Promise<Model> {
  model ??= (async () => {
    const ort = await import('onnxruntime-web/webgpu');
    // Multi-threaded WASM needs cross-origin isolation; use what's available.
    ort.env.wasm.numThreads = self.crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency)
      : 1;
    const providers = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'];
    const session = await ort.InferenceSession.create(asset(MODEL), {
      executionProviders: providers,
    });
    return { ort, session };
  })();
  model.catch(() => (model = undefined)); // let a later run retry
  return model;
}

export const upscale = mapOp({
  id: 'upscale',
  kind: 'map',
  title: 'Upscale 4×',
  description: 'Enlarge 4× with AI super-resolution (Real-ESRGAN) that rebuilds detail.',
  icon: 'upscale',
  suffix: 'upscaled',
  heavy: true,
  params: {},
  check: tooLarge,
  async run(image, _values, context) {
    const problem = tooLarge(image);
    if (problem) throw new Error(problem);
    const { ort, session } = await loadModel(context.asset);

    const source = readPixels(image);
    const { width, height } = source;
    const out = createCanvas(width * UPSCALE_FACTOR, height * UPSCALE_FACTOR);
    const outContext = context2d(out);

    for (let y0 = 0; y0 < height; y0 += TILE) {
      for (let x0 = 0; x0 < width; x0 += TILE) {
        const x1 = Math.min(x0 + TILE, width);
        const y1 = Math.min(y0 + TILE, height);
        const px0 = Math.max(x0 - TILE_PAD, 0);
        const py0 = Math.max(y0 - TILE_PAD, 0);
        const px1 = Math.min(x1 + TILE_PAD, width);
        const py1 = Math.min(y1 + TILE_PAD, height);
        const tw = px1 - px0;
        const th = py1 - py0;

        // RGBA bytes → planar float32 RGB in [0, 1] (NCHW).
        const input = new Float32Array(3 * tw * th);
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            const s = ((py0 + y) * width + px0 + x) * 4;
            const d = y * tw + x;
            input[d] = source.data[s] / 255;
            input[tw * th + d] = source.data[s + 1] / 255;
            input[2 * tw * th + d] = source.data[s + 2] / 255;
          }
        }
        const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, th, tw]) };
        const result = (await session.run(feeds))[session.outputNames[0]];
        const output = (await result.getData()) as Float32Array;
        result.dispose();

        // Crop the padding off and write the tile (8-bit, opaque).
        const ow = tw * UPSCALE_FACTOR;
        const plane = ow * th * UPSCALE_FACTOR;
        const cw = (x1 - x0) * UPSCALE_FACTOR;
        const ch = (y1 - y0) * UPSCALE_FACTOR;
        const ox = (x0 - px0) * UPSCALE_FACTOR;
        const oy = (y0 - py0) * UPSCALE_FACTOR;
        const tile = new ImageData(cw, ch);
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const s = (oy + y) * ow + ox + x;
            const d = (y * cw + x) * 4;
            tile.data[d] = output[s] * 255 + 0.5;
            tile.data[d + 1] = output[plane + s] * 255 + 0.5;
            tile.data[d + 2] = output[2 * plane + s] * 255 + 0.5;
            tile.data[d + 3] = 255;
          }
        }
        outContext.putImageData(tile, x0 * UPSCALE_FACTOR, y0 * UPSCALE_FACTOR);
      }
    }

    if (hasTransparency(source.data)) {
      // The model only sees RGB: carry transparency over from a smoothly
      // resampled copy of the original.
      const alpha = readPixels(resized(image, out.width, out.height)).data;
      const result = readPixels(out);
      for (let i = 3; i < result.data.length; i += 4) result.data[i] = alpha[i];
      outContext.putImageData(result.image, 0, 0);
    }
    return out;
  },
});
