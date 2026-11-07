import { describe, expect, it } from 'vitest';

import {
  applyDrag,
  aspectFactor,
  centeredCrop,
  cropPixels,
  fitInside,
  isCrop,
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

  it('validates stored crops', () => {
    expect(isCrop({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(isCrop({ x: 0.5, y: 0, width: 0.6, height: 1 })).toBe(false);
    expect(isCrop({ x: 0, y: 0, width: 0, height: 1 })).toBe(false);
    expect(isCrop('nope')).toBe(false);
  });

  it('swaps the axes for quarter turns', () => {
    expect(orientedSize({ width: 400, height: 300 }, 90)).toEqual({ width: 300, height: 400 });
    expect(orientedSize({ width: 400, height: 300 }, 180)).toEqual({ width: 400, height: 300 });
  });
});

describe('mergeLayout', () => {
  const sizes = [
    { width: 100, height: 50 },
    { width: 200, height: 100 },
  ];

  it('stacks vertically, centered, at natural size', () => {
    const layout = mergeLayout(sizes, {
      direction: 'vertical',
      alignment: 'center',
      resize: 'none',
      gap: 0,
    });
    expect(layout).toMatchObject({ width: 200, height: 150 });
    expect(layout.placements[0]).toEqual({ x: 50, y: 0, width: 100, height: 50 });
    expect(layout.placements[1]).toEqual({ x: 0, y: 50, width: 200, height: 100 });
  });

  it('fills the cross axis and adds gaps side by side', () => {
    const layout = mergeLayout(sizes, {
      direction: 'horizontal',
      alignment: 'start',
      resize: 'fill',
      gap: 10,
    });
    expect(layout).toMatchObject({ width: 200 + 10 + 200, height: 100 });
    expect(layout.placements[1].x).toBe(210);
  });

  it('handles no images', () => {
    expect(
      mergeLayout([], { direction: 'vertical', alignment: 'start', resize: 'none', gap: 0 }),
    ).toEqual({ width: 0, height: 0, placements: [] });
  });
});

describe('marginPixels', () => {
  it('measures percentages against the shorter side', () => {
    expect(
      marginPixels({ top: 10, right: 0, bottom: 5, left: 1 }, 'percent', {
        width: 400,
        height: 200,
      }),
    ).toEqual({ top: 20, right: 0, bottom: 10, left: 2 });
  });
});
