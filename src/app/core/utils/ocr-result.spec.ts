import { describe, expect, it } from 'vitest';

import { OcrApiResponse } from '../models/ocr-result.model';
import { buildOcrResult } from './ocr-result';

const sample: OcrApiResponse = {
  width: 200,
  height: 100,
  text: 'Hello world\nagain',
  words: [
    { text: 'Hello', left: 10, top: 20, width: 40, height: 10, confidence: 96, line: 0 },
    { text: 'world', left: 60, top: 20, width: 50, height: 10, confidence: 90, line: 0 },
    { text: 'again', left: 10, top: 50, width: 40, height: 10, confidence: 88, line: 1 },
  ],
};

describe('buildOcrResult', () => {
  it('converts pixel word boxes into fractions of the image', () => {
    const result = buildOcrResult('scan.png', 'blob:url', sample);

    expect(result.fileName).toBe('scan.png');
    expect(result.imageUrl).toBe('blob:url');
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.text).toBe('Hello world\nagain');

    const [hello] = result.words;
    expect(hello.left).toBeCloseTo(0.05);
    expect(hello.top).toBeCloseTo(0.2);
    expect(hello.width).toBeCloseTo(0.2);
    expect(hello.height).toBeCloseTo(0.1);
    expect(hello.confidence).toBe(96);
    expect(hello.line).toBe(0);
  });

  it('preserves word count and line grouping', () => {
    const result = buildOcrResult('scan.png', 'blob:url', sample);
    expect(result.words).toHaveLength(3);
    expect(result.words.map((w) => w.line)).toEqual([0, 0, 1]);
  });

  it('avoids dividing by zero for degenerate dimensions', () => {
    const result = buildOcrResult('empty.png', 'blob:url', {
      width: 0,
      height: 0,
      text: '',
      words: [{ text: 'x', left: 0, top: 0, width: 0, height: 0, confidence: 50, line: 0 }],
    });

    expect(result.words[0].left).toBe(0);
    expect(result.words[0].width).toBe(0);
    expect(Number.isFinite(result.words[0].left)).toBe(true);
  });
});
