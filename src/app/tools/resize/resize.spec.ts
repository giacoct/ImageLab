import { describe, expect, it } from 'vitest';

import { applyDrag, centeredCrop, ratioFactor } from './resize';

describe('ratioFactor', () => {
  it('derives the fraction-space factor from the pixel ratio', () => {
    // A 1:1 crop on a 200x100 image: height fraction = 2 × width fraction.
    expect(ratioFactor('1:1', { width: 200, height: 100 })).toBe(2);
    expect(ratioFactor('16:9', { width: 1600, height: 900 })).toBeCloseTo(1);
  });

  it('uses the image itself for the original preset', () => {
    expect(ratioFactor('original', { width: 400, height: 300 })).toBeCloseTo(1);
  });
});

describe('centeredCrop', () => {
  it('pins the longer axis and centers the shorter one', () => {
    expect(centeredCrop(2)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    expect(centeredCrop(0.5)).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
    expect(centeredCrop(1)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('applyDrag', () => {
  const full = { x: 0, y: 0, width: 1, height: 1 };

  it('clamps a move to the image bounds', () => {
    const crop = { x: 0.5, y: 0.5, width: 0.4, height: 0.4 };
    const moved = applyDrag(crop, 'move', 0.5, 0.5, null);
    expect(moved.x).toBeCloseTo(0.6);
    expect(moved.y).toBeCloseTo(0.6);
  });

  it('resizes from the dragged edge in free mode', () => {
    const crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    const resized = applyDrag(crop, 'se', -0.1, -0.2, null);
    expect(resized.width).toBeCloseTo(0.5);
    expect(resized.height).toBeCloseTo(0.4);
    expect(resized.x).toBeCloseTo(0.2);
    expect(resized.y).toBeCloseTo(0.2);
  });

  it('enforces the minimum crop size', () => {
    const shrunk = applyDrag(full, 'se', -2, -2, null);
    expect(shrunk.width).toBeGreaterThanOrEqual(0.05);
    expect(shrunk.height).toBeGreaterThanOrEqual(0.05);
  });

  it('keeps the ratio when locked', () => {
    const crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
    const dragged = applyDrag(crop, 'se', -0.1, 0, 2);
    expect(dragged.height).toBeCloseTo(dragged.width * 2);
  });

  it('stays inside the image when ratio-locked at a corner', () => {
    const dragged = applyDrag(full, 'se', 0.5, 0.5, 1);
    expect(dragged.x + dragged.width).toBeLessThanOrEqual(1.000001);
    expect(dragged.y + dragged.height).toBeLessThanOrEqual(1.000001);
  });
});
