/**
 * How an image will be saved. Every image carries one through the chain: it
 * starts as the input's format, and the Convert format and Compress steps
 * change it.
 */

import { savedFormat, type ImageFormat } from './files';

export interface Encoding {
  format: ImageFormat;
  /**
   * Picked by a Convert format step. Otherwise it's the input's format, and
   * a JPEG becomes PNG when the image has transparency (e.g. a GIF's).
   */
  chosen: boolean;
  /** 1–100, for JPEG, WebP and AVIF. */
  quality: number;
  /** When set, the quality (PNG: the dimensions) is lowered until the file fits. */
  targetBytes: number | null;
}

/** How an image decoded from a file of `sourceType` is saved unless a step says otherwise. */
export function initialEncoding(sourceType: string): Encoding {
  return {
    format: savedFormat(sourceType),
    chosen: false,
    quality: 90,
    targetBytes: null,
  };
}

/** The format to write now; `transparent` is only asked when it matters. */
export function formatToWrite(
  encoding: Encoding,
  transparent: () => boolean,
): ImageFormat {
  if (!encoding.chosen && encoding.format === 'image/jpeg' && transparent())
    return 'image/png';
  return encoding.format;
}
