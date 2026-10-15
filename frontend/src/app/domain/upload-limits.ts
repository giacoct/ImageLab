import { formatBytes } from './image-files';
import { ImageDimensions } from './image-output.model';

/** The backend's upload limits, as served by `GET /api/limits`. */
export interface UploadLimits {
  maxUploadBytes: number;
  /** Longest side the upscaler accepts, in pixels. */
  maxUpscaleSide: number;
}

/**
 * Why `file` would be rejected by the backend, or `null` if it's fine. Pass
 * `dimensions` to also apply the upscaler's size cap.
 */
export function uploadProblem(
  file: { name: string; size: number },
  limits: UploadLimits,
  dimensions?: ImageDimensions,
): string | null {
  if (file.size > limits.maxUploadBytes) {
    return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(limits.maxUploadBytes)}.`;
  }
  if (dimensions && Math.max(dimensions.width, dimensions.height) > limits.maxUpscaleSide) {
    return (
      `${file.name} is ${dimensions.width} × ${dimensions.height} px; ` +
      `the longest side can be at most ${limits.maxUpscaleSide} px.`
    );
  }
  return null;
}
