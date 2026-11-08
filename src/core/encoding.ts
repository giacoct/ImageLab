/**
 * How an image will be saved. Every image carries one through the chain:
 * it starts as the input's format, and the Convert format and Compress
 * steps change it. The file is written once at the end, unless one of those
 * steps already wrote it and nothing changed the pixels since.
 */

import { sameFormat, type RasterFormat } from './files';

export type FileFormat = RasterFormat | 'image/x-icon';

export interface Encoding {
  format: FileFormat;
  /**
   * Picked by a Convert format step. Otherwise it's the input's format, and
   * a JPEG becomes PNG once a step adds transparency.
   */
  chosen: boolean;
  /** 1–100, for JPEG, WebP and AVIF. */
  quality: number;
  /** When set, the quality (PNG: the dimensions) is lowered until the file fits. */
  targetBytes: number | null;
  /** Side of an ICO icon, in pixels. */
  icoSize: number;
}

export const DEFAULT_QUALITY = 90;

/** How an image decoded from a file of `sourceType` is saved unless a step says otherwise. */
export function initialEncoding(sourceType: string): Encoding {
  return {
    // GIF, BMP, HEIC… are saved as JPEG (PNG once transparent).
    format: sameFormat(sourceType, false),
    chosen: false,
    quality: DEFAULT_QUALITY,
    targetBytes: null,
    icoSize: 256,
  };
}

/** The format to write now; `transparent` is only asked when it matters. */
export function formatToWrite(encoding: Encoding, transparent: () => boolean): FileFormat {
  if (!encoding.chosen && encoding.format === 'image/jpeg' && transparent()) return 'image/png';
  return encoding.format;
}
