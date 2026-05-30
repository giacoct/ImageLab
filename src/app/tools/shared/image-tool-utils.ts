import { OutputFormat } from '../../core/models/image-output.model';

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
  }
}

export function renameFile(fileName: string, suffix: string, format: OutputFormat): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  return `${baseName}-${suffix}.${extensionForFormat(format)}`;
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
