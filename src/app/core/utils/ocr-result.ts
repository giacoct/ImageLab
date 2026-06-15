import { OcrApiResponse, OcrResult, OcrWord } from '../models/ocr-result.model';

/**
 * Convert an `/api/ocr` response into an {@link OcrResult}: pixel word boxes
 * become fractions of the image so the selectable overlay scales with whatever
 * size the image is displayed at. Degenerate image dimensions yield zero-sized
 * boxes rather than dividing by zero.
 */
export function buildOcrResult(
  fileName: string,
  imageUrl: string,
  api: OcrApiResponse,
): OcrResult {
  const w = api.width > 0 ? api.width : 1;
  const h = api.height > 0 ? api.height : 1;

  const words: OcrWord[] = api.words.map((word) => ({
    text: word.text,
    left: word.left / w,
    top: word.top / h,
    width: word.width / w,
    height: word.height / h,
    confidence: word.confidence,
    line: word.line,
  }));

  return {
    fileName,
    imageUrl,
    width: api.width,
    height: api.height,
    text: api.text,
    words,
  };
}
