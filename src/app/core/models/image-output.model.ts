export interface ImageOutput {
  fileName: string;
  blob: Blob;
  url: string;
  size: number;
  width: number;
  height: number;
}

export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageDimensions {
  width: number;
  height: number;
}
