import { describe, expect, it } from "vitest";

import {
  adjustPixels,
  blurPixels,
  hasTransparency,
  sharpenPixels,
} from "./pixels";

const NEUTRAL = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  invert: false,
};

function solid(
  width: number,
  height: number,
  rgba: number[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return data;
}

describe("pixels", () => {
  it("leaves pixels alone with neutral adjustments", () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255]);
    adjustPixels(data, NEUTRAL);
    expect([...data]).toEqual([10, 20, 30, 255]);
  });

  it("applies brightness, grayscale and invert", () => {
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

  it("blurs without darkening transparent edges", () => {
    const data = solid(5, 1, [0, 0, 0, 0]);
    data.set([255, 255, 255, 255], 8); // one white opaque pixel in the middle
    blurPixels({ data, width: 5, height: 1 }, 2);
    expect(data[0]).toBe(255); // spread color stays white, not gray
    expect(data[3]).toBeGreaterThan(0);
    expect(data[11]).toBeLessThan(255);
  });

  it("sharpens edges and keeps flat areas", () => {
    const flat = solid(3, 3, [100, 100, 100, 255]);
    expect([...sharpenPixels({ data: flat, width: 3, height: 3 }, 1)]).toEqual([
      ...flat,
    ]);
  });

  it("detects transparency", () => {
    expect(hasTransparency(solid(2, 2, [1, 2, 3, 255]))).toBe(false);
    expect(hasTransparency(solid(2, 2, [1, 2, 3, 254]))).toBe(true);
  });
});
