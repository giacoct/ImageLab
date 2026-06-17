import { computeMergeLayout } from './merge-layout';

describe('computeMergeLayout', () => {
  it('stacks vertically, summing heights and using the widest width', () => {
    const layout = computeMergeLayout(
      [
        { width: 100, height: 40 },
        { width: 60, height: 30 },
      ],
      { direction: 'vertical', alignment: 'start', resize: 'none' },
    );

    expect(layout.width).toBe(100);
    expect(layout.height).toBe(70);
    expect(layout.placements[0]).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(layout.placements[1]).toEqual({ x: 0, y: 40, width: 60, height: 30 });
  });

  it('stacks horizontally, summing widths and using the tallest height', () => {
    const layout = computeMergeLayout(
      [
        { width: 40, height: 100 },
        { width: 30, height: 60 },
      ],
      { direction: 'horizontal', alignment: 'start', resize: 'none' },
    );

    expect(layout.width).toBe(70);
    expect(layout.height).toBe(100);
    expect(layout.placements[1]).toEqual({ x: 40, y: 0, width: 30, height: 60 });
  });

  it('centres a narrower image on the cross axis of a vertical stack', () => {
    const layout = computeMergeLayout(
      [
        { width: 100, height: 40 },
        { width: 60, height: 30 },
      ],
      { direction: 'vertical', alignment: 'center', resize: 'none' },
    );

    // (100 - 60) / 2 = 20
    expect(layout.placements[1].x).toBe(20);
  });

  it('right-aligns (end) a narrower image on a vertical stack', () => {
    const layout = computeMergeLayout(
      [
        { width: 100, height: 40 },
        { width: 60, height: 30 },
      ],
      { direction: 'vertical', alignment: 'end', resize: 'none' },
    );

    expect(layout.placements[1].x).toBe(40);
  });

  it('fills width: scales each image to the widest, so all share one width', () => {
    const layout = computeMergeLayout(
      [
        { width: 100, height: 50 },
        { width: 50, height: 40 },
      ],
      { direction: 'vertical', alignment: 'start', resize: 'fill' },
    );

    expect(layout.width).toBe(100);
    // Second image scales 2×: 50→100 wide, 40→80 tall.
    expect(layout.placements[1].width).toBe(100);
    expect(layout.placements[1].height).toBe(80);
    expect(layout.height).toBe(50 + 80);
  });

  it('fills height: scales each image to the tallest for a horizontal stack', () => {
    const layout = computeMergeLayout(
      [
        { width: 50, height: 100 },
        { width: 40, height: 50 },
      ],
      { direction: 'horizontal', alignment: 'start', resize: 'fill' },
    );

    expect(layout.height).toBe(100);
    // Second image scales 2×: 40→80 wide, 50→100 tall.
    expect(layout.placements[1].width).toBe(80);
    expect(layout.width).toBe(50 + 80);
  });

  it('returns an empty layout for no images', () => {
    expect(computeMergeLayout([], { direction: 'vertical', alignment: 'start', resize: 'none' })).toEqual({
      width: 0,
      height: 0,
      placements: [],
    });
  });
});
