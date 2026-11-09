/**
 * Upscale with AI: Real-ESRGAN's small general model (realesr-general-x4v3,
 * BSD-3-Clause, in `models/`), run by ONNX Runtime on the GPU (WebGPU) when
 * the browser has one, else on the CPU (WASM). The model enlarges 4×; 2×
 * halves its result, which still beats a plain resize. Both the runtime and
 * the model load the first time it runs.
 *
 * The model file is the original with one fix: its output's dimensions were
 * named like the input's (`height`, `width`) though they're 4× larger, which
 * made the WebGPU backend reuse a buffer of the wrong size. They're renamed
 * `HEIGHT` and `WIDTH` (same length, nothing else changed).
 */

import type { InferenceSession, Tensor } from "onnxruntime-web";

import { hasTransparency } from "../core/pixels";
import { p } from "../core/params";
import {
  context2d,
  createCanvas,
  downscaled,
  readPixels,
  resized,
  type Img,
} from "../engine/canvas";
import modelUrl from "./models/realesr-general-x4v3.onnx?url";
import { mapOp } from "./op";

/** What the model does to each side. */
const FACTOR = 4;

/**
 * Longest input side. Bounds time and memory: a 1500 px image is 6000 px
 * on the model's output (144 MB), which a phone can still hold.
 */
export const MAX_SIDE = 1500;

/**
 * The image goes through the model in tiles, so memory stays bounded. Each
 * is padded with its surroundings, for context across the seams (with the
 * edge pixels repeated past the image's borders), and the padding is cropped
 * off the result. Every tile has the same size: the GPU backend reuses its
 * buffers from one run to the next, and fails if the shape changes.
 */
const TILE = 256;
const PAD = 16;
const SIDE = TILE + PAD * 2;

interface Model {
  session: InferenceSession;
  Tensor: typeof Tensor;
  gpu: boolean;
}

let model: Promise<Model> | undefined;

/** ONNX Runtime and the model, once per engine worker. */
function loadModel(): Promise<Model> {
  model ??= (async () => {
    // The WebGPU build is twice the download: only where there's a GPU to use.
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } })
      .gpu;
    if (await gpu?.requestAdapter().catch(() => null)) {
      try {
        const ort = await import("onnxruntime-web/webgpu");
        const session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ["webgpu"],
        });
        return { session, Tensor: ort.Tensor, gpu: true };
      } catch {
        // The GPU failed: the CPU will do.
      }
    }
    return cpuModel();
  })();
  model.catch(() => (model = undefined)); // let a later run retry
  return model;
}

async function cpuModel(): Promise<Model> {
  const ort = await import("onnxruntime-web/wasm");
  // Threads need cross-origin isolation, which GitHub Pages can't enable.
  ort.env.wasm.numThreads = self.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency)
    : 1;
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ["wasm"],
  });
  return { session, Tensor: ort.Tensor, gpu: false };
}

/** The image 4× larger; on the CPU from now on if the GPU fails. */
async function enlarge(
  image: Img,
  progress?: (fraction: number) => void,
): Promise<Img> {
  const loaded = await loadModel();
  try {
    return await enlargeWith(loaded, image, progress);
  } catch (error) {
    if (!loaded.gpu) throw error;
    console.warn("Upscaling on the GPU failed, now on the CPU:", error);
    void loaded.session.release().catch(() => {});
    model = cpuModel();
    model.catch(() => (model = undefined));
    return enlargeWith(await model, image, progress);
  }
}

/** The image 4× larger, through the model tile by tile (opaque). */
async function enlargeWith(
  { session, Tensor }: Model,
  image: Img,
  progress?: (fraction: number) => void,
): Promise<Img> {
  const { data, width, height } = readPixels(image);
  const out = createCanvas(width * FACTOR, height * FACTOR);
  const outContext = context2d(out);
  const clamp = (value: number, max: number) =>
    Math.max(0, Math.min(max, value));

  const plane = SIDE * SIDE;
  const input = new Float32Array(3 * plane);
  const ow = SIDE * FACTOR;
  const outPlane = ow * ow;
  const tiles = Math.ceil(width / TILE) * Math.ceil(height / TILE);
  let done = 0;
  for (let y0 = 0; y0 < height; y0 += TILE) {
    for (let x0 = 0; x0 < width; x0 += TILE) {
      // RGBA bytes → planar float RGB in [0, 1] (NCHW).
      for (let y = 0; y < SIDE; y++) {
        const sy = clamp(y0 - PAD + y, height - 1);
        for (let x = 0; x < SIDE; x++) {
          const s = (sy * width + clamp(x0 - PAD + x, width - 1)) * 4;
          const d = y * SIDE + x;
          input[d] = data[s] / 255;
          input[plane + d] = data[s + 1] / 255;
          input[2 * plane + d] = data[s + 2] / 255;
        }
      }
      const feeds = {
        [session.inputNames[0]]: new Tensor("float32", input, [
          1,
          3,
          SIDE,
          SIDE,
        ]),
      };
      const result = (await session.run(feeds))[session.outputNames[0]];
      const output = (await result.getData()) as Float32Array;
      result.dispose();

      // Crop the padding off, back to 8-bit RGBA.
      const cw = (Math.min(x0 + TILE, width) - x0) * FACTOR;
      const ch = (Math.min(y0 + TILE, height) - y0) * FACTOR;
      const offset = PAD * FACTOR;
      const tile = new ImageData(cw, ch);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const s = (offset + y) * ow + offset + x;
          const d = (y * cw + x) * 4;
          tile.data[d] = output[s] * 255 + 0.5;
          tile.data[d + 1] = output[outPlane + s] * 255 + 0.5;
          tile.data[d + 2] = output[2 * outPlane + s] * 255 + 0.5;
          tile.data[d + 3] = 255;
        }
      }
      outContext.putImageData(tile, x0 * FACTOR, y0 * FACTOR);
      progress?.(++done / tiles);
    }
  }

  if (hasTransparency(data)) {
    // The model only sees RGB: transparency comes from a smooth resize.
    const alpha = readPixels(resized(image, out.width, out.height)).data;
    const result = readPixels(out);
    for (let i = 3; i < alpha.length; i += 4) result.data[i] = alpha[i];
    outContext.putImageData(result.image, 0, 0);
  }
  return out;
}

export const upscale = mapOp({
  id: "upscale",
  kind: "map",
  title: "Upscale with AI",
  description: "Enlarge the image and rebuild its detail with an AI model.",
  suffix: "upscaled",
  heavy: true,
  params: {
    factor: p.choice({
      label: "Enlarge",
      default: "4",
      options: [
        { value: "2", label: "2×" },
        { value: "4", label: "4×" },
      ],
      hint: `For images up to ${MAX_SIDE} px on the longest side. The preview shows the image as it is.`,
    }),
  },
  async run(image, values, context) {
    if (Math.max(image.width, image.height) > MAX_SIDE)
      throw new Error(
        `Too large to upscale (${image.width} × ${image.height} px): the longest side can be at most ${MAX_SIDE} px. Scale it down first.`,
      );
    const out = await enlarge(image, context.progress);
    return values.factor === "2"
      ? downscaled(out, image.width * 2, image.height * 2)
      : out;
  },
});
