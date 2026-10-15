/** One produced image, as shown on the output page and downloaded/chained from there. */
export interface ImageOutput {
  fileName: string;
  blob: Blob;
  /** Object URL of `blob` (for <img> previews and downloads); revoke it when discarded. */
  url: string;
  /** Size in bytes. */
  size: number;
  width: number;
  height: number;
}

/** Formats the browser canvas can encode (AVIF only in Chromium). */
export type CanvasOutputFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
/** Every format a tool can output; ICO is written by hand around a PNG. */
export type OutputFormat = CanvasOutputFormat | 'image/x-icon';

export interface ImageDimensions {
  width: number;
  height: number;
}
