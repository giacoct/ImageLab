import { describe, expect, it } from 'vitest';

import {
  adjustPixels,
  blurPixels,
  hasTransparency,
  hexToRgb,
  isFlatArt,
  keyColor,
  medianFilter,
  modeFilter,
  quantize,
  sharpenPixels,
} from './pixels';

const NEUTRAL = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  invert: false,
};

function solid(width: number, height: number, rgba: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return data;
}

describe('pixels', () => {
  it('parses colors', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('junk')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('leaves pixels alone with neutral adjustments', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255]);
    adjustPixels(data, NEUTRAL);
    expect([...data]).toEqual([10, 20, 30, 255]);
  });

  it('applies brightness, grayscale and invert', () => {
    const bright = new Uint8ClampedArray([100, 50, 0, 255]);
    adjustPixels(bright, { ...NEUTRAL, brightness: 200 });
    expect([...bright]).toEqual([200, 100, 0, 255]);

    const gray = new Uint8ClampedArray([255, 0, 0, 255]);
    adjustPixels(gray, { ...NEUTRAL, grayscale: 100 });
    expect(gray[0]).toBe(gray[1]);
    expect(gray[1]).toBe(gray[2]);

    const inverted = new Uint8ClampedArray([0, 100, 255, 7]);
    adjustPixels(inverted, { ...NEUTRAL, invert: true });
    expect([...inverted]).toEqual([255, 155, 0, 7]);
  });

  it('blurs without darkening transparent edges', () => {
    const data = solid(5, 1, [0, 0, 0, 0]);
    data.set([255, 255, 255, 255], 8); // one white opaque pixel in the middle
    blurPixels({ data, width: 5, height: 1 }, 2);
    expect(data[0]).toBe(255); // spread color stays white, not gray
    expect(data[3]).toBeGreaterThan(0);
    expect(data[11]).toBeLessThan(255);
  });

  it('sharpens edges and keeps flat areas', () => {
    const flat = solid(3, 3, [100, 100, 100, 255]);
    expect([...sharpenPixels({ data: flat, width: 3, height: 3 }, 1)]).toEqual([...flat]);
  });

  it('keys out a color with a soft edge', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 230, 230, 230, 255]);
    keyColor(data, { color: '#ffffff', tolerance: 2, smoothing: 30 });
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    expect(data[11]).toBeGreaterThan(0);
    expect(data[11]).toBeLessThan(255);
    expect(hasTransparency(data)).toBe(true);
  });

  it('tells flat art from noise', () => {
    expect(isFlatArt(solid(10, 10, [0, 128, 255, 255]))).toBe(true);
    const noise = new Uint8ClampedArray(64 * 64 * 4).map((_, i) =>
      i % 4 === 3 ? 255 : (i * 7919) % 256,
    );
    expect(isFlatArt(noise)).toBe(false);
  });

  it('removes isolated speckles with mode and median filters', () => {
    const data = solid(5, 5, [0, 0, 0, 255]);
    data.set([255, 255, 255, 255], 12 * 4); // center pixel
    const image = { data, width: 5, height: 5 };
    expect(modeFilter(image)[12 * 4]).toBe(0);
    expect(medianFilter(image)[12 * 4]).toBe(0);
  });

  it('keeps minority colors next to a dominant background', () => {
    const data = solid(100, 1, [255, 255, 255, 255]);
    for (let i = 0; i < 10; i++) data.set([11, 118, 111, 255], i * 4); // teal
    data.set([130, 190, 185, 255], 10 * 4); // one anti-aliased pixel
    quantize(data, 16);
    expect([...data.subarray(0, 4)]).toEqual([11, 118, 111, 255]);
    expect([...data.subarray(50 * 4, 50 * 4 + 4)]).toEqual([255, 255, 255, 255]);
  });

  it('quantizes to a limited palette', () => {
    const data = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) data.set([i, 255 - i, (i * 3) % 256, 255], i * 4);
    quantize(data, 4);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4)
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    expect(colors.size).toBeLessThanOrEqual(4);
  });
});
