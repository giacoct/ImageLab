import { describe, expect, it } from 'vitest';

import {
  applyDrag,
  aspectFactor,
  centeredCrop,
  cropPixels,
  fitInside,
  marginPixels,
  mergeLayout,
  orientedSize,
} from './geometry';

describe('fitInside', () => {
  it('shrinks to the box keeping the ratio', () => {
    expect(fitInside({ width: 4000, height: 3000 }, { width: 1600, height: 1600 })).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it('never enlarges unless asked', () => {
    expect(fitInside({ width: 100, height: 50 }, { width: 400, height: 400 })).toEqual({
      width: 100,
      height: 50,
    });
    expect(fitInside({ width: 100, height: 50 }, { width: 400, height: 400 }, true)).toEqual({
      width: 400,
      height: 200,
    });
  });
});

describe('crop', () => {
  it('derives the fraction-space factor from the pixel ratio', () => {
    expect(aspectFactor('1:1', { width: 200, height: 100 })).toBe(2);
    expect(aspectFactor('16:9', { width: 1600, height: 900 })).toBeCloseTo(1);
    expect(aspectFactor('original', { width: 400, height: 300 })).toBeCloseTo(1);
    expect(aspectFactor('free', { width: 400, height: 300 })).toBeNull();
  });

  it('centers the largest crop of a ratio', () => {
    expect(centeredCrop(2)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    expect(centeredCrop(0.5)).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
    expect(centeredCrop(null)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('clamps a move to the image', () => {
    const moved = applyDrag({ x: 0.5, y: 0.5, width: 0.4, height: 0.4 }, 'move', 0.5, 0.5, null);
    expect(moved.x).toBeCloseTo(0.6);
    expect(moved.y).toBeCloseTo(0.6);
  });

  it('resizes from the dragged corner and keeps a minimum size', () => {
    const resized = applyDrag({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, 'se', -0.1, -0.2, null);
    expect(resized).toMatchObject({ x: 0.2, y: 0.2 });
    expect(resized.width).toBeCloseTo(0.5);
    expect(resized.height).toBeCloseTo(0.4);
    const tiny = applyDrag({ x: 0, y: 0, width: 1, height: 1 }, 'se', -2, -2, null);
    expect(tiny.width).toBeGreaterThanOrEqual(0.05);
  });

  it('keeps a locked ratio inside the image', () => {
    const dragged = applyDrag({ x: 0, y: 0, width: 1, height: 1 }, 'se', 0.5, 0.5, 1);
    expect(dragged.x + dragged.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(dragged.height).toBeCloseTo(dragged.width);
  });

  it('converts to whole pixels inside the image', () => {
    expect(
      cropPixels({ x: 0.25, y: 0, width: 0.5, height: 1 }, { width: 400, height: 300 }),
    ).toEqual({ x: 100, y: 0, width: 200, height: 300 });
  });

  it('swaps the axes for quarter turns', () => {
    expect(orientedSize({ width: 400, height: 300 }, 90)).toEqual({ width: 300, height: 400 });
    expect(orientedSize({ width: 400, height: 300 }, 180)).toEqual({ width: 400, height: 300 });
  });
});

describe('mergeLayout', () => {
  const sizes = [
    { width: 100, height: 50 },
    { width: 50, height: 50 },
  ];

  it('stacks vertically, centered, at natural size', () => {
    const layout = mergeLayout(sizes, {
      direction: 'vertical',
      align: 'center',
      match: false,
      gap: 0,
    });
    expect([layout.width, layout.height]).toEqual([100, 100]);
    expect(layout.places[1]).toEqual({ x: 25, y: 50, width: 50, height: 50 });
  });

  it('matches heights and adds gaps side by side', () => {
    const layout = mergeLayout(sizes, {
      direction: 'horizontal',
      align: 'start',
      match: true,
      gap: 10,
    });
    expect([layout.width, layout.height]).toEqual([160, 50]);
    expect(layout.places[1]).toEqual({ x: 110, y: 0, width: 50, height: 50 });
  });

  it('lays out a single image as itself', () => {
    const layout = mergeLayout([sizes[0]], {
      direction: 'vertical',
      align: 'end',
      match: true,
      gap: 20,
    });
    expect([layout.width, layout.height]).toEqual([100, 50]);
  });
});

describe('marginPixels', () => {
  it('measures percentages against the shorter side', () => {
    const sides = { top: 10, right: 0, bottom: 5, left: 0 };
    expect(marginPixels(sides, 'percent', { width: 400, height: 200 })).toEqual({
      top: 20,
      right: 0,
      bottom: 10,
      left: 0,
    });
    expect(marginPixels(sides, 'px', { width: 400, height: 200 }).top).toBe(10);
  });
});
