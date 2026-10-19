/** One recognized word, positioned as fractions (0..1) of the source image. */
export interface OcrWord {
  text: string;
  /** Left edge, 0..1 of image width. */
  left: number;
  /** Top edge, 0..1 of image height. */
  top: number;
  /** Box width, 0..1 of image width. */
  width: number;
  /** Box height, 0..1 of image height. */
  height: number;
}

/** Recognized text for a single image, plus the geometry for the overlay. */
export interface OcrResult {
  fileName: string;
  /** Object URL of the source image, shown behind the selectable text layer. */
  imageUrl: string;
  /** The full extracted text, lines separated by `\n`. */
  text: string;
  words: readonly OcrWord[];
}

/** A word box as returned by the backend (pixel coordinates, in reading order). */
interface OcrApiWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
  line: number;
}

/** The `/api/ocr` response shape. */
export interface OcrApiResponse {
  width: number;
  height: number;
  text: string;
  words: readonly OcrApiWord[];
}
