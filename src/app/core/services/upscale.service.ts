import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ImageOutput } from '../models/image-output.model';
import { ImageProcessingService } from './image-processing.service';

/** Native upscale factor of the Real-ESRGAN model behind `/api/upscale`. */
export const UPSCALE_FACTOR = 4;

export interface UpscaleOptions {
  fileName: string;
}

/**
 * Enlarges images by delegating to the Real-ESRGAN backend (proxied at `/api`).
 * Unlike a canvas resample, the model reconstructs detail and cleans artifacts,
 * so a small image comes back {@link UPSCALE_FACTOR}x larger and sharper. The
 * result flows through the existing output pipeline as an ordinary PNG
 * {@link ImageOutput}.
 */
@Injectable({ providedIn: 'root' })
export class UpscaleService {
  private readonly http = inject(HttpClient);
  private readonly processing = inject(ImageProcessingService);

  async upscale(file: File, options: UpscaleOptions): Promise<ImageOutput> {
    const form = new FormData();
    form.append('file', file);

    const [blob, dimensions] = await Promise.all([
      this.postUpscale(form),
      this.processing.getDimensions(file),
    ]);

    return {
      fileName: options.fileName,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      width: dimensions.width * UPSCALE_FACTOR,
      height: dimensions.height * UPSCALE_FACTOR,
    };
  }

  /** POST to the backend, translating HTTP failures into readable errors. */
  private async postUpscale(form: FormData): Promise<Blob> {
    try {
      return await firstValueFrom(this.http.post('/api/upscale', form, { responseType: 'blob' }));
    } catch (error) {
      throw new Error(await describeUpscaleError(error));
    }
  }
}

/** Build a user-facing message, preferring the backend's own `detail` text. */
async function describeUpscaleError(error: unknown): Promise<string> {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'The upscaler service is not reachable. Please try again later.';
    }
    if (error.error instanceof Blob) {
      try {
        const detail: unknown = JSON.parse(await error.error.text()).detail;
        if (typeof detail === 'string' && detail.length > 0) {
          return detail;
        }
      } catch {
        // Not a JSON body — fall through to the generic message.
      }
    }
    return `The upscaler service failed (HTTP ${error.status}).`;
  }
  return 'The image could not be upscaled.';
}
