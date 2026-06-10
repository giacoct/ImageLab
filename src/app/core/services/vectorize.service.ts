import { HttpClient } from '@angular/common/http';
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
      firstValueFrom(this.http.post('/api/vectorize', form, { responseType: 'blob' })),
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
}
