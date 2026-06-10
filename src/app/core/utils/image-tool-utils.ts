import { CanvasOutputFormat, OutputFormat } from '../models/image-output.model';

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

let avifSupport: Promise<boolean> | null = null;

/**
 * Whether this browser can *encode* AVIF via `canvas.toBlob`. Chromium can;
 * the canvas silently falls back to PNG elsewhere, which is what the
 * blob-type check detects. The probe runs once and is cached.
 */
export function supportsAvifOutput(): Promise<boolean> {
  avifSupport ??= new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvas.toBlob((blob) => resolve(blob?.type === 'image/avif'), 'image/avif');
    } catch {
      resolve(false);
    }
  });
  return avifSupport;
}

export function renameFile(fileName: string, suffix: string, format: OutputFormat): string {
  return renameWithExtension(fileName, suffix, extensionForFormat(format));
}

/** Like {@link renameFile} but for formats outside the canvas/ICO set (e.g. SVG). */
export function renameWithExtension(fileName: string, suffix: string, extension: string): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  return `${baseName}-${suffix}.${extension}`;
}

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

export function clampQuality(value: number): number {
  return Math.min(1, Math.max(0.1, value / 100));
}

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
