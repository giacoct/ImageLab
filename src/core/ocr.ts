/**
 * OCR post-processing (pure): merge the word detections of several Tesseract
 * passes, group them into reading-order lines, and express each box as a
 * fraction of the image so the selectable text overlay scales with the display.
 */

/** OCR languages shipped with the app (their data is copied by scripts/assets.mjs). */
export const OCR_LANGUAGES = ['eng', 'ita'] as const;
export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

/** A word as Tesseract reports it, in pixels. */
export interface RawWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** A recognized word, positioned as fractions (0..1) of the image. */
export interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrPage {
  /** The full text, lines separated by `\n`. */
  text: string;
  words: OcrWord[];
}

/** Words Tesseract is this unsure about are usually noise that would clutter the overlay. */
export const MIN_CONFIDENCE = 30;

interface Box {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Combine the passes (e.g. normal + inverted image, so both dark-on-light and
 * light-on-dark text are found) into one page of reading-order text.
 */
export function buildOcrPage(passes: readonly RawWord[][], width: number, height: number): OcrPage {
  const boxes = passes.flat().flatMap((word): Box[] => {
    const text = word.text.trim();
    if (!text || word.confidence < MIN_CONFIDENCE) return [];
    const { x0, y0, x1, y1 } = word.bbox;
    return [
      { text, confidence: word.confidence, left: x0, top: y0, width: x1 - x0, height: y1 - y0 },
    ];
  });

  const lines = groupLines(dedupe(boxes));
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  return {
    text: lines.map((line) => line.map((word) => word.text).join(' ')).join('\n'),
    words: lines.flat().map((word) => ({
      text: word.text,
      left: word.left / w,
      top: word.top / h,
      width: word.width / w,
      height: word.height / h,
    })),
  };
}

/** Intersection-over-union of two boxes. */
export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const iy = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  const inter = ix * iy;
  return inter === 0 ? 0 : inter / (a.width * a.height + b.width * b.height - inter);
}

/** Keep the most confident detection per location; sorted top-to-bottom, left-to-right. */
function dedupe(boxes: readonly Box[], threshold = 0.5): Box[] {
  const kept: Box[] = [];
  for (const box of [...boxes].sort((a, b) => b.confidence - a.confidence)) {
    if (!kept.some((other) => iou(box, other) > threshold)) kept.push(box);
  }
  return kept.sort((a, b) => a.top - b.top || a.left - b.left);
}

/** Group words whose vertical spans overlap into lines, each sorted left-to-right. */
function groupLines(boxes: readonly Box[]): Box[][] {
  const lines: Box[][] = [];
  for (const box of boxes) {
    const center = box.top + box.height / 2;
    let line = lines.find(
      (candidate) =>
        Math.min(...candidate.map((w) => w.top)) <= center &&
        center <= Math.max(...candidate.map((w) => w.top + w.height)),
    );
    if (!line) {
      line = [];
      lines.push(line);
    }
    line.push(box);
  }
  return lines.map((line) => line.sort((a, b) => a.left - b.left));
}
