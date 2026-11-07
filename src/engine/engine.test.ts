/**
 * Engine tests in a real browser (Vitest browser mode, Chromium): decoding,
 * encoding, every operation, and the worker round trip. Images are drawn
 * synthetically so the expected pixels are known.
 */

import { describe, expect, it } from 'vitest';

import { defaults } from '../core/params';
import { EXPORT_PARAMS, type ExportSettings, type Step } from '../core/recipe';
import { getOp } from '../ops';
import type { RunContext } from '../ops/op';
import { cropForImage } from '../ops/transform';
import { context2d, createCanvas, readPixels, type Img } from './canvas';
import { engine } from './client';
import { decode } from './decode';
import { encodeImage } from './encode';
import heicUrl from './fixtures/logo.heic?url';
import { processJob, renderPreview } from './pipeline';

const context: RunContext = {
  scale: 1,
  asset: (path) => new URL(path, location.origin + '/').href,
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

async function pngBlob(image: Img): Promise<Blob> {
  return image.convertToBlob({ type: 'image/png' });
}

function step(op: string, params: Record<string, unknown> = {}): Step {
  return { id: op, op, params: { ...defaults(getOp(op).params), ...params } };
}

const exportAs = (settings: Partial<ExportSettings>): ExportSettings => ({
  ...defaults(EXPORT_PARAMS),
  ...settings,
});

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
    const { blob, width } = await encodeImage(twoTone(), exportAs({ format }), 'image/png');
    expect(blob.type).toBe(`image/${format}`);
    expect(width).toBe(40);
    const { image } = await decode(blob);
    expect(image.width).toBe(40);
  });

  it('keeps the source format, switching JPEG to PNG for transparency', async () => {
    const transparent = createCanvas(10, 10);
    expect(
      (await encodeImage(twoTone(), exportAs({ format: 'same' }), 'image/jpeg')).blob.type,
    ).toBe('image/jpeg');
    expect(
      (await encodeImage(transparent, exportAs({ format: 'same' }), 'image/jpeg')).blob.type,
    ).toBe('image/png');
  });

  it('meets a target size by lowering the quality', async () => {
    const noisy = createCanvas(300, 300);
    const data = readPixels(noisy);
    for (let i = 0; i < data.data.length; i++)
      data.data[i] = i % 4 === 3 ? 255 : (i * 2654435761) % 256;
    context2d(noisy).putImageData(data.image, 0, 0);
    const best = await encodeImage(noisy, exportAs({ format: 'jpeg', quality: 100 }), 'image/png');
    const { blob } = await encodeImage(
      noisy,
      exportAs({ format: 'jpeg', sizing: 'target', targetKb: 30 }),
      'image/png',
    );
    expect(blob.size).toBeLessThanOrEqual(30 * 1024);
    expect(best.blob.size).toBeGreaterThan(30 * 1024);
  });

  it('writes a letterboxed ICO', async () => {
    const { blob, width } = await encodeImage(
      twoTone(),
      exportAs({ format: 'ico', icoSize: 32 }),
      'image/png',
    );
    expect(blob.type).toBe('image/x-icon');
    expect(width).toBe(32);
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

  it('adjusts colors', async () => {
    const gray = await run('adjust', twoTone(), { grayscale: 100 });
    const [r, g, b] = pixel(gray, 2, 2);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('removes a background color', async () => {
    const keyed = await run('remove-background', twoTone(), { color: '#0000ff', tolerance: 5 });
    expect(pixel(keyed, 30, 5)[3]).toBe(0);
    expect(pixel(keyed, 5, 5)[3]).toBe(255);
  });

  it('adds a margin', async () => {
    const framed = await run('margin', twoTone(), { all: 5, color: '#00ff00' });
    expect([framed.width, framed.height]).toEqual([50, 30]);
    expect(pixel(framed, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(framed, 6, 6)).toEqual([255, 0, 0, 255]);
  });

  it('merges images', async () => {
    const op = getOp('merge');
    if (op.kind !== 'combine') throw new Error('merge should combine');
    const merged = await op.run(
      [twoTone(), twoTone(20, 10)],
      step('merge', { gap: 2 }).params,
      context,
    );
    expect([merged.width, merged.height]).toEqual([40, 32]);
  });

  it('upscales 4× with the model', async () => {
    const out = await run('upscale', twoTone(16, 8));
    expect([out.width, out.height]).toEqual([64, 32]);
    expect(pixel(out, 4, 16)[0]).toBeGreaterThan(200); // still red on the left
    expect(pixel(out, 60, 16)[2]).toBeGreaterThan(200); // still blue on the right
  });

  it('refuses images too large to upscale', async () => {
    await expect(run('upscale', createCanvas(2000, 10))).rejects.toThrow(/at most 1500/);
  });

  it('traces to SVG', async () => {
    const op = getOp('vectorize');
    if (op.kind !== 'svg') throw new Error('vectorize should produce SVG');
    const auto = await op.run(twoTone(), step('vectorize').params, context);
    expect(auto).toMatch(/<svg[^>]*width="40" height="20"/);
    expect(auto).toContain('<path');
    const manual = await op.run(
      twoTone(),
      step('vectorize', { preset: 'manual', mode: 'polygon' }).params,
      context,
    );
    expect(manual).toContain('<path');
  });

  it('recognizes dark text on light and light text on dark', async () => {
    const op = getOp('ocr');
    if (op.kind !== 'text') throw new Error('ocr should produce text');
    const textImage = (text: string, ink: string, paper: string) => {
      const canvas = createCanvas(600, 120);
      const ctx = context2d(canvas);
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, 600, 120);
      ctx.fillStyle = ink;
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText(text, 20, 80);
      return canvas;
    };

    const dark = await op.run(
      textImage('HELLO WORLD', '#000000', '#ffffff'),
      step('ocr').params,
      context,
    );
    expect(dark.text).toBe('HELLO WORLD');
    expect(dark.words[0].left).toBeGreaterThan(0);
    expect(dark.words[0].left).toBeLessThan(0.1);
    const light = await op.run(
      textImage('INVERTED', '#ffffff', '#1a3a8a'),
      step('ocr').params,
      context,
    );
    expect(light.text).toBe('INVERTED');
  });
});

describe('pipeline', () => {
  const input = async (name = 'photo.png') => ({ name, blob: await pngBlob(twoTone()) });

  it('chains steps and names the output after the last one', async () => {
    const [output] = await processJob(
      [await input()],
      {
        steps: [step('scale', { percent: 50 }), step('margin', { all: 2 })],
        export: exportAs({ format: 'webp' }),
      },
      context,
    );
    expect(output.name).toBe('photo-margin.webp');
    expect([output.width, output.height]).toEqual([24, 14]);
  });

  it('merges all inputs into one output', async () => {
    const outputs = await processJob(
      [await input('a.png'), await input('b.png')],
      { steps: [step('merge')], export: exportAs({ format: 'png' }) },
      context,
    );
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ name: 'a-merged.png', width: 40, height: 40 });
  });

  it('strips metadata without re-encoding', async () => {
    const original = await input();
    const [output] = await processJob(
      [original],
      { steps: [], export: exportAs({ format: 'keep' }), suffix: 'clean' },
      context,
    );
    expect(output.name).toBe('photo-clean.png');
    expect(output.blob.size).toBe(original.blob.size); // a canvas PNG has no metadata to drop
  });

  it('returns text and the image it was read from', async () => {
    const [output] = await processJob(
      [await input()],
      { steps: [step('ocr')], export: exportAs({}) },
      context,
    );
    expect(output.name).toBe('photo-text.txt');
    expect(output.display?.type).toBe('image/webp');
    expect(output.ocr).toBeDefined();
  });

  it('previews on a downscaled copy and stops before slow steps', async () => {
    const files = [{ key: 'a', blob: await pngBlob(twoTone(400, 200)) }];
    const preview = await renderPreview(
      files,
      0,
      [step('margin', { all: 40 }), step('upscale')],
      100,
      context.asset,
    );
    // 400×200 → 100×50 proxy; the 40 px margin scales to 10 px; upscale is skipped.
    expect([preview.width, preview.height]).toEqual([120, 70]);
  });
});

describe('worker client', () => {
  it('runs jobs in the engine worker', async () => {
    const outputs = await engine.run('process', {
      inputs: [{ name: 'photo.png', blob: await pngBlob(twoTone()) }],
      recipe: { steps: [step('scale', { percent: 25 })], export: exportAs({ format: 'jpeg' }) },
    });
    expect(outputs[0]).toMatchObject({ name: 'photo-scaled.jpg', width: 10, height: 5 });
  });

  it('inspects files', async () => {
    const info = await engine.run('inspect', { blob: await pngBlob(twoTone()) });
    expect(info).toMatchObject({ width: 40, height: 20, type: 'image/png' });
    expect(info.thumbnail.size).toBeGreaterThan(0);
  });

  it('reports errors from the worker', async () => {
    await expect(engine.run('inspect', { blob: new Blob(['nope']) })).rejects.toThrow(
      /not an image/,
    );
  });
});
