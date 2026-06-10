import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ImageOutput } from '../models/image-output.model';
import { ImageProcessingService } from './image-processing.service';

export type VectorizeMode = 'spline' | 'polygon';
export type VectorizePreset = 'auto' | 'manual';

export interface VectorizeOptions {
  /** `auto` lets the backend analyze the image and pick every setting. */
  preset: VectorizePreset;
  /** Significant bits per RGB channel; higher keeps more distinct colors. */
  colorPrecision: number;
  /** Discard color patches smaller than this many pixels (speckle cleanup). */
  filterSpeckle: number;
  /** Curve fitting: smooth splines vs straight polygon edges. */
  mode: VectorizeMode;
  /** Angle (degrees) under which a corner is kept; higher = rounder curves. */
  cornerThreshold: number;
  /** Minimum traced segment length; higher discards jitter for smoother paths. */
  lengthThreshold: number;
  fileName: string;
}

/**
 * Vectorizes images by delegating to the VTracer backend (proxied at `/api`).
 * Unlike a browser tracer, VTracer's stacking strategy yields a handful of
 * clean, smooth shapes, so the result flows through the existing output
 * pipeline as an ordinary SVG {@link ImageOutput}.
 */
@Injectable({ providedIn: 'root' })
export class VectorizeService {
  private readonly http = inject(HttpClient);
  private readonly processing = inject(ImageProcessingService);

  async toSvg(file: File, options: VectorizeOptions): Promise<ImageOutput> {
    const form = new FormData();
    form.append('file', file);
    form.append('preset', options.preset);
    if (options.preset === 'manual') {
      form.append('color_precision', String(options.colorPrecision));
      form.append('filter_speckle', String(options.filterSpeckle));
      form.append('mode', options.mode);
      form.append('corner_threshold', String(options.cornerThreshold));
      form.append('length_threshold', String(options.lengthThreshold));
    }

    const [blob, dimensions] = await Promise.all([
      this.postVectorize(form),
      this.processing.getDimensions(file),
    ]);

    return {
      fileName: options.fileName,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  /** POST to the backend, translating HTTP failures into readable errors. */
  private async postVectorize(form: FormData): Promise<Blob> {
    try {
      return await firstValueFrom(this.http.post('/api/vectorize', form, { responseType: 'blob' }));
    } catch (error) {
      throw new Error(await describeVectorizeError(error));
    }
  }
}

/** Build a user-facing message, preferring the backend's own `detail` text. */
async function describeVectorizeError(error: unknown): Promise<string> {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'The vectorizer service is not reachable. Please try again later.';
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
    return `The vectorizer service failed (HTTP ${error.status}).`;
  }
  return 'The image could not be vectorized.';
}
