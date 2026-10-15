/** Pure helpers for naming, sizing, and choosing formats of output images. */

import { CanvasOutputFormat, OutputFormat } from './image-output.model';

/** Human-readable file size, e.g. `1.5 KB`. */
export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function extensionForFormat(format: OutputFormat): string {
  switch (format) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    case 'image/x-icon':
      return 'ico';
  }
}

/** `photo.png` + `resized` + WebP → `photo-resized.webp`. */
export function renameFile(fileName: string, suffix: string, format: OutputFormat): string {
  return renameWithExtension(fileName, suffix, extensionForFormat(format));
}

/** Like {@link renameFile} but for formats outside the canvas/ICO set (e.g. SVG). */
export function renameWithExtension(fileName: string, suffix: string, extension: string): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  return `${baseName}-${suffix}.${extension}`;
}

/** Keep the source format when the canvas can encode it; fall back to PNG otherwise. */
export function outputFormatForFile(file: File): CanvasOutputFormat {
  switch (file.type) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
      return file.type;
    default:
      return 'image/png';
  }
}

/** Turn a 0–100 quality percentage into the 0.1–1 range `canvas.toBlob` expects. */
export function clampQuality(value: number): number {
  return Math.min(1, Math.max(0.1, value / 100));
}

/** Shrink `width`×`height` to fit inside a `maxSize` square, keeping the aspect ratio (never enlarges). */
export function dimensionsForMaxSize(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const scale = maxSize / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
