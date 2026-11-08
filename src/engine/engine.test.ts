/**
 * Engine tests in a real browser (Vitest browser mode, Chromium): decoding,
 * encoding, every operation, chains of steps, and the worker round trip.
 * Images are drawn synthetically so the expected pixels are known.
 */

import { describe, expect, it } from 'vitest';

import { initialEncoding, type Encoding } from '../core/encoding';
import type { ImageFormat } from '../core/files';
import { defaults } from '../core/params';
import { getOp } from '../ops';
import type { RunContext, Step } from '../ops/op';
import { cropForImage } from '../ops/transform';
import { context2d, createCanvas, readPixels, type Img } from './canvas';
import { Cancelled, engine } from './client';
import { decode } from './decode';
import { encodeImage } from './encode';
import heicUrl from './fixtures/logo.heic?url';
import { processJob, renderPreview, type Output } from './pipeline';

const context: RunContext = {
  scale: 1,
  asset: (path) => new URL(path, `${location.origin}/`).href,
};

/** A `width`×`height` image: left half red, right half blue. */
function twoTone(width = 40, height = 20): Img {
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(width / 2, 0, width / 2, height);
  return canvas;
}

function pixel(image: Img, x: number, y: number): number[] {
  return [...context2d(image).getImageData(x, y, 1, 1).data];
}

function pngBlob(image: Img): Promise<Blob> {
  return image.convertToBlob({ type: 'image/png' });
}

function step(op: string, params: Record<string, unknown> = {}): Step {
  return { id: op, op, params: { ...defaults(getOp(op).params), ...params } };
}

/** Save as `format`, as a Convert format step would. */
const as = (format: ImageFormat, settings: Partial<Encoding> = {}): Encoding => ({
  ...initialEncoding('image/png'),
  format,
  chosen: true,
  ...settings,
});

/** A 300×300 image of noise, which compresses badly. */
function noise(): Img {
  const canvas = createCanvas(300, 300);
  const data = readPixels(canvas);
  for (let i = 0; i < data.data.length; i++)
    data.data[i] = i % 4 === 3 ? 255 : (i * 2654435761) % 256;
  context2d(canvas).putImageData(data.image, 0, 0);
  return canvas;
}

async function run(op: string, image: Img, params: Record<string, unknown> = {}) {
  const definition = getOp(op);
  if (definition.kind !== 'map') throw new Error('not a map op');
  return definition.run(image, step(op, params).params, context);
}

describe('decode', () => {
  it('decodes PNG and sniffs the type', async () => {
    const { image, type } = await decode(await pngBlob(twoTone()));
    expect(type).toBe('image/png');
    expect([image.width, image.height]).toEqual([40, 20]);
  });

  it('decodes HEIC through libheif', async () => {
    const blob = await (await fetch(heicUrl)).blob();
    const { image, type } = await decode(blob);
    expect(type).toBe('image/heic');
    expect([image.width, image.height]).toEqual([64, 64]);
  });

  it('rejects files that are not images', async () => {
    await expect(decode(new Blob(['hello'], { type: 'text/plain' }))).rejects.toThrow(
      /not an image/,
    );
  });
});

describe('encode', () => {
  it.each(['jpeg', 'png', 'webp', 'avif'] as const)('writes %s', async (format) => {
    const { blob, width } = await encodeImage(twoTone(), as(`image/${format}`));
    expect(blob.type).toBe(`image/${format}`);
    expect(width).toBe(40);
    const { image } = await decode(blob);
    expect(image.width).toBe(40);
  });

  it('keeps the input format, switching JPEG to PNG for transparency', async () => {
    const kept = initialEncoding('image/jpeg');
    expect((await encodeImage(twoTone(), kept)).blob.type).toBe('image/jpeg');
    expect((await encodeImage(createCanvas(10, 10), kept)).blob.type).toBe('image/png');
  });

  it('meets a target size by lowering the quality', async () => {
    const best = await encodeImage(noise(), as('image/jpeg', { quality: 100 }));
    const { blob } = await encodeImage(noise(), as('image/jpeg', { targetBytes: 30 * 1024 }));
    expect(blob.size).toBeLessThanOrEqual(30 * 1024);
    expect(best.blob.size).toBeGreaterThan(30 * 1024);
  });

  it('meets a target size for PNG by lowering the dimensions', async () => {
    const { blob, width } = await encodeImage(noise(), as('image/png', { targetBytes: 50 * 1024 }));
    expect(blob.size).toBeLessThanOrEqual(50 * 1024);
    expect(width).toBeLessThan(300);
  });
});

describe('operations', () => {
  it('rotates, flips and crops', async () => {
    const rotated = await run('transform', twoTone(), { rotate: '90' });
    expect([rotated.width, rotated.height]).toEqual([20, 40]);
    expect(pixel(rotated, 10, 5)).toEqual([255, 0, 0, 255]); // red half now on top

    const flipped = await run('transform', twoTone(), { flipH: true });
    expect(pixel(flipped, 2, 2)).toEqual([0, 0, 255, 255]);

    const cropped = await run('transform', twoTone(), {
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
    });
    expect([cropped.width, cropped.height]).toEqual([20, 20]);
    expect(pixel(cropped, 5, 5)).toEqual([0, 0, 255, 255]);
  });

  it('adapts a ratio crop to each image', () => {
    const crop = cropForImage({ x: 0, y: 0, width: 1, height: 1 }, '1:1', {
      width: 400,
      height: 200,
    });
    expect(crop.width * 400).toBeCloseTo(crop.height * 200);
  });

  it('scales by percentage, box and width', async () => {
    expect((await run('scale', twoTone(), { mode: 'percent', percent: 50 })).width).toBe(20);
    const boxed = await run('scale', twoTone(400, 200), { mode: 'fit', width: 100, height: 100 });
    expect([boxed.width, boxed.height]).toEqual([100, 50]);
    const small = await run('scale', twoTone(), { mode: 'width', width: 400 });
    expect(small.width).toBe(40); // never enlarges unless asked
  });

  it('adds a margin, in pixels or percent, colored or transparent', async () => {
    const framed = await run('margin', twoTone(), { size: 5, color: '#00ff00' });
    expect([framed.width, framed.height]).toEqual([50, 30]);
    expect(pixel(framed, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(framed, 6, 6)).toEqual([255, 0, 0, 255]);
    const sides = await run('margin', twoTone(), {
      unit: 'percent',
      same: false,
      top: 50,
      right: 0,
      bottom: 0,
      left: 0,
      transparent: true,
    });
    expect([sides.width, sides.height]).toEqual([40, 30]); // 50% of the 20 px side on top
    expect(pixel(sides, 1, 1)[3]).toBe(0);
  });

  it('removes a detected background', async () => {
    const canvas = createCanvas(30, 30);
    const ctx = context2d(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 30, 30);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(10, 10, 10, 10);
    const keyed = await run('remove-background', canvas);
    expect(pixel(keyed, 2, 2)[3]).toBe(0);
    expect(pixel(keyed, 15, 15)).toEqual([0, 0, 255, 255]);
  });

  it('adjusts colors', async () => {
    const gray = await run('adjust', twoTone(), { grayscale: 100 });
    const [r, g, b] = pixel(gray, 2, 2);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe('pipeline', () => {
  const input = async (name = 'photo.png', image = twoTone()) => ({
    name,
    blob: await pngBlob(image),
  });

  /** Run a chain on one input, which gives one output. */
  async function processFile(
    one: { name: string; blob: Blob },
    steps: Step[],
    runContext: RunContext,
  ): Promise<Output> {
    const outputs = await processJob([one], steps, runContext);
    expect(outputs).toHaveLength(1);
    return outputs[0];
  }

  it('chains steps, keeps the input format, and names the output after the last step', async () => {
    const output = await processFile(
      await input(),
      [step('scale', { percent: 50 }), step('transform', { rotate: '90' })],
      context,
    );
    expect(output.name).toBe('photo-edited.png');
    expect([output.width, output.height]).toEqual([10, 20]);
  });

  it('keeps a converted format through later steps', async () => {
    const output = await processFile(
      await input(),
      [step('convert', { format: 'jpeg' }), step('adjust', { brightness: 120 })],
      context,
    );
    expect(output.name).toBe('photo-adjusted.jpg');
    expect(output.blob.type).toBe('image/jpeg');
  });

  it('chains any tool more than once', async () => {
    const output = await processFile(
      await input(),
      [
        step('convert', { format: 'jpeg' }),
        step('scale', { percent: 50 }),
        step('convert', { format: 'webp' }),
        step('scale', { percent: 50 }),
      ],
      context,
    );
    expect(output.blob.type).toBe('image/webp');
    expect([output.width, output.height]).toEqual([10, 5]);
  });

  it('compresses to a file size', async () => {
    const output = await processFile(
      await input('noise.png', noise()),
      [step('convert', { format: 'jpeg' }), step('compress', { mode: 'target', targetKb: 30 })],
      context,
    );
    expect(output.blob.type).toBe('image/jpeg');
    expect(output.blob.size).toBeLessThanOrEqual(30 * 1024);
  });

  it('outputs the file Convert format wrote when nothing changed after it', async () => {
    const image = noise();
    const written = await encodeImage(image, as('image/webp', { quality: 50 }));
    const output = await processFile(
      await input('noise.png', image),
      [step('convert', { format: 'webp', quality: 50 })],
      context,
    );
    // Re-encoding the decoded WebP would give a different file.
    expect(output.blob.size).toBe(written.blob.size);
  });

  it('refuses an empty chain', async () => {
    await expect(processFile(await input(), [], context)).rejects.toThrow(/Add a step/);
  });

  it('makes small thumbnails of the results', async () => {
    const output = await processFile(
      await input('big.png', twoTone(2000, 1000)),
      [step('adjust')],
      context,
    );
    expect(output.thumbnail.type).toBe('image/webp');
    const { image } = await decode(output.thumbnail);
    expect([image.width, image.height]).toEqual([480, 240]);
  });

  it('previews on a downscaled copy, scaling pixel settings', async () => {
    const files = [{ key: 'a', blob: await pngBlob(twoTone(400, 200)) }];
    const steps = [step('scale', { mode: 'width', width: 200 })];
    // 400×200 → 100×50 preview; 200 px wide at full size is 50 px at this scale.
    const preview = await renderPreview({ files, steps, maxSide: 100 }, context.asset);
    expect([preview.width, preview.height]).toEqual([50, 25]);
    // Another size comes from the same cached copy, scaled the same way.
    const larger = await renderPreview({ files, steps, maxSide: 200 }, context.asset);
    expect([larger.width, larger.height]).toEqual([100, 50]);
  });

  it('previews a merge at one common scale', async () => {
    const files = [
      { key: 'm1', blob: await pngBlob(twoTone(400, 200)) },
      { key: 'm2', blob: await pngBlob(twoTone(200, 100)) },
    ];
    const preview = await renderPreview(
      { files, steps: [step('merge')], maxSide: 200 },
      context.asset,
    );
    // Both at the scale where the larger fits 200 px, smaller for two images (÷√2).
    expect(preview.width).toBe(Math.round(400 * (0.5 / Math.SQRT2)));
    expect(preview.height).toBeGreaterThan(preview.width / 2);
  });

  it('merges all the inputs into one output', async () => {
    const outputs = await processJob(
      [await input('a.png'), await input('b.png', twoTone(20, 10))],
      [step('scale', { percent: 50 }), step('merge', { gap: 4 })],
      context,
    );
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ name: 'a-merged.png', width: 20, height: 19 });
  });

  it('strips metadata without re-encoding', async () => {
    const jpeg = (await encodeImage(twoTone(), as('image/jpeg'))).blob;
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const comment = [0xff, 0xfe, 0, 7, ...[...'hello'].map((c) => c.charCodeAt(0))];
    const tagged = new Blob([bytes.subarray(0, 2), new Uint8Array(comment), bytes.subarray(2)], {
      type: 'image/jpeg',
    });
    const output = await processFile(
      { name: 'photo.jpg', blob: tagged },
      [step('strip-metadata')],
      context,
    );
    expect(output.name).toBe('photo-clean.jpg');
    expect(new Uint8Array(await output.blob.arrayBuffer())).toEqual(bytes);
  });

  it('reads the text in an image, dark on light or light on dark', async () => {
    const textImage = (text: string, ink: string, paper: string) => {
      const canvas = createCanvas(640, 120);
      const ctx = context2d(canvas);
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, 640, 120);
      ctx.fillStyle = ink;
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(text, 20, 85);
      return canvas;
    };
    const dark = await processFile(
      await input('note.png', textImage('HELLO WORLD', '#000000', '#ffffff')),
      [step('ocr')],
      context,
    );
    expect(dark).toMatchObject({ name: 'note-text.txt', text: 'HELLO WORLD' });
    expect(await dark.blob.text()).toBe('HELLO WORLD');
    const light = await processFile(
      await input('sign.png', textImage('INVERTED', '#ffffff', '#1a3a8a')),
      [step('ocr', { layout: 'sparse' })],
      context,
    );
    expect(light.text).toBe('INVERTED');
  });

  it('traces an image to SVG at its original size', async () => {
    const output = await processFile(await input(), [step('vectorize')], context);
    expect(output.name).toBe('photo-vector.svg');
    const svg = await output.blob.text();
    expect(svg).toMatch(/<svg[^>]*width="40" height="20" viewBox/);
    expect(svg).toContain('<path');
    const bw = await processFile(await input(), [step('vectorize', { colors: 'bw' })], context);
    expect(await bw.blob.text()).toContain('<path');
  });

  it('keeps OCR and SVG steps last', async () => {
    await expect(
      processJob([await input()], [step('ocr'), step('scale')], context),
    ).rejects.toThrow(/must be the last step/);
  });
});

describe('worker client', () => {
  it('runs jobs in the engine worker', async () => {
    const [output] = await engine.run('process', {
      inputs: [{ name: 'photo.png', blob: await pngBlob(twoTone()) }],
      steps: [step('scale', { percent: 25 }), step('convert', { format: 'jpeg' })],
    });
    expect(output).toMatchObject({ name: 'photo-converted.jpg', width: 10, height: 5 });
  });

  it('renders previews in the preview worker', async () => {
    const bitmap = await engine.preview({
      files: [{ key: 'worker', blob: await pngBlob(twoTone()) }],
      steps: [],
      maxSide: 100,
    });
    expect([bitmap.width, bitmap.height]).toEqual([40, 20]);
  });

  it('inspects files', async () => {
    const info = await engine.run('inspect', { blob: await pngBlob(twoTone()) });
    expect(info).toMatchObject({ width: 40, height: 20, type: 'image/png', metadata: [] });
    expect(info.thumbnail.size).toBeGreaterThan(0);
  });

  it('reports errors from the worker', async () => {
    await expect(engine.run('inspect', { blob: new Blob(['nope']) })).rejects.toThrow(
      /not an image/,
    );
  });

  it('keeps serving requests that wait behind a cancelled batch', async () => {
    const blob = await pngBlob(noise());
    const steps = [step('convert', { format: 'avif', quality: 100 })];
    const controller = new AbortController();
    // More jobs than workers, so some of them wait for a free one.
    const batch = Array.from({ length: 12 }, () =>
      engine.run('process', { inputs: [{ name: 'n.png', blob }], steps }, controller.signal),
    );
    const waiting = engine.run('inspect', { blob });
    controller.abort();
    const settled = await Promise.allSettled(batch);
    expect(settled.every((r) => r.status === 'rejected' && r.reason instanceof Cancelled)).toBe(
      true,
    );
    expect((await waiting).width).toBe(300);
  });
});
