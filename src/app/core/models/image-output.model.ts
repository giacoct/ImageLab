export interface ImageOutput {
  fileName: string;
  blob: Blob;
  url: string;
  size: number;
  width: number;
  height: number;
}

export type CanvasOutputFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
export type OutputFormat = CanvasOutputFormat | 'image/x-icon';

export interface ImageDimensions {
  width: number;
  height: number;
}
