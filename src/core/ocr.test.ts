import { describe, expect, it } from 'vitest';

import { buildOcrPage, type RawWord } from './ocr';

const word = (
  text: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  confidence = 90,
): RawWord => ({
  text,
  confidence,
  bbox: { x0, y0, x1, y1 },
});

describe('buildOcrPage', () => {
  it('groups words into reading-order lines', () => {
    const page = buildOcrPage(
      [[word('world', 60, 0, 110, 20), word('hello', 0, 2, 50, 22), word('again', 0, 40, 50, 60)]],
      200,
      100,
    );
    expect(page.text).toBe('hello world\nagain');
    expect(page.words[0]).toEqual({ text: 'hello', left: 0, top: 0.02, width: 0.25, height: 0.2 });
  });

  it('keeps the most confident of overlapping detections across passes', () => {
    const page = buildOcrPage(
      [
        [word('he1lo', 0, 0, 50, 20, 40)],
        [word('hello', 1, 0, 51, 20, 95), word('noise', 0, 50, 9, 60, 10)],
      ],
      100,
      100,
    );
    expect(page.text).toBe('hello');
  });
});
