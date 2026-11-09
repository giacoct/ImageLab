/**
 * The live preview of Adjust & filters (WebGL2) against what applying makes
 * in the worker: the same image, the same settings, the same pixels, to a
 * few levels of rounding.
 */

import { describe, expect, it } from 'vitest';

import { defaults } from '../core/params';
import { getOp } from '../ops';
import type { MapOp } from '../ops/op';
import { context2d, createCanvas, readPixels, type Img } from './canvas';
import { LiveAdjust, type LiveSettings } from './live';

const adjust = getOp('adjust') as MapOp;

/** Color gradients, with a transparent corner and a half-transparent band. */
function sample(): Img {
  const canvas = createCanvas(64, 48);
  const pixels = readPixels(canvas);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      pixels.data[i] = x * 4;
      pixels.data[i + 1] = y * 5;
      pixels.data[i + 2] = (x * y) % 256;
      pixels.data[i + 3] = x < 8 && y < 8 ? 0 : y > 40 ? 128 : 255;
    }
  }
  context2d(canvas).putImageData(pixels.image, 0, 0);
  return canvas;
}

function copy(image: Img): Img {
  const out = createCanvas(image.width, image.height);
  context2d(out).drawImage(image, 0, 0);
  return out;
}

/** What the GPU draws, read back as straight RGBA. */
function gpu(source: Img, settings: LiveSettings, scale: number) {
  const canvas = new OffscreenCanvas(1, 1);
  const renderer = LiveAdjust.create(canvas);
  expect(renderer).not.toBeNull();
  renderer!.draw(source, settings, scale);
  const out = createCanvas(canvas.width, canvas.height);
  context2d(out).drawImage(canvas, 0, 0);
  renderer!.dispose();
  return readPixels(out).data;
}

async function cpu(source: Img, settings: LiveSettings, scale: number) {
  const context = { scale, asset: (path: string) => path };
  const image = await adjust.run(copy(source), settings as never, context);
  return readPixels(image).data;
}

/**
 * Largest and mean difference between two RGBA buffers, as seen: colors
 * weighted by their alpha. (Faint pixels lose precision in the worker,
 * whose canvases keep colors premultiplied in 8 bits.)
 */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let max = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const seen = (data: Uint8ClampedArray) =>
      i % 4 === 3 ? data[i] : (data[i] * data[i - (i % 4) + 3]) / 255;
    const d = Math.abs(seen(a) - seen(b));
    max = Math.max(max, d);
    sum += d;
  }
  return { max, mean: sum / a.length };
}

const base = defaults(adjust.params) as unknown as LiveSettings;

describe('live preview of Adjust & filters', () => {
  const cases: [string, Partial<LiveSettings>, number][] = [
    ['unchanged', {}, 1],
    ['brightness and contrast', { brightness: 140, contrast: 70 }, 1],
    ['color', { saturation: 180, grayscale: 30, sepia: 40, invert: true }, 1],
    ['blur, scaled to the preview', { blur: 12 }, 0.5],
    ['sharpen', { sharpen: 60 }, 1],
    ['everything', { brightness: 80, contrast: 130, blur: 4, sharpen: 30 }, 1],
  ];

  for (const [name, settings, scale] of cases) {
    it(`matches applying: ${name}`, async () => {
      const source = sample();
      const values = { ...base, ...settings };
      const { max, mean } = difference(
        gpu(source, values, scale),
        await cpu(source, values, scale),
      );
      expect(max).toBeLessThanOrEqual(4);
      expect(mean).toBeLessThan(0.5);
    });
  }

  it('keeps the image upright and takes a new source at its size', () => {
    const canvas = new OffscreenCanvas(1, 1);
    const renderer = LiveAdjust.create(canvas)!;
    const tall = createCanvas(10, 30);
    const ctx = context2d(tall);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 10, 10); // red on top
    renderer.draw(sample(), base, 1);
    renderer.draw(tall, base, 1);
    expect([canvas.width, canvas.height]).toEqual([10, 30]);
    const out = createCanvas(10, 30);
    context2d(out).drawImage(canvas, 0, 0);
    expect([...context2d(out).getImageData(5, 2, 1, 1).data]).toEqual([
      255, 0, 0, 255,
    ]);
    expect(context2d(out).getImageData(5, 25, 1, 1).data[3]).toBe(0);
    renderer.dispose();
  });
});
