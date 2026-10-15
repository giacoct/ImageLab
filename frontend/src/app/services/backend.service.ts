import { Injectable, inject } from '@angular/core';

import { ImageOutput } from '../domain/image-output.model';
import { OcrApiResponse, OcrResult } from '../domain/ocr-result.model';
import { buildOcrResult } from '../domain/ocr-result';
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

/** Native scale factor of the Real-ESRGAN model behind `/api/upscale`. */
export const UPSCALE_FACTOR = 4;

/**
 * The three tools that run on the FastAPI backend (`/api/...`, see
 * docs/api.md): Convert to SVG (VTracer), Extract text (Tesseract) and
 * Upscale image (Real-ESRGAN). Results come back as ordinary
 * {@link ImageOutput}s / {@link OcrResult}s, so the rest of the app doesn't
 * care where they were produced.
 */
@Injectable({ providedIn: 'root' })
export class BackendService {
  private readonly processing = inject(ImageProcessingService);

  async vectorize(file: File, options: VectorizeOptions): Promise<ImageOutput> {
    const form = new FormData();
    form.append('file', file);
    form.append('preset', options.preset);
    if (options.preset === 'manual') {
      form.append('mode', options.mode);
      form.append('color_precision', String(options.colorPrecision));
      form.append('filter_speckle', String(options.filterSpeckle));
      form.append('corner_threshold', String(options.cornerThreshold));
      form.append('length_threshold', String(options.lengthThreshold));
    }

    const [response, size] = await Promise.all([
      callApi('vectorize', 'vectorizer', { method: 'POST', body: form }),
      this.processing.getDimensions(file),
    ]);
    return toOutput(await response.blob(), size.width, size.height, options.fileName);
  }

  async upscale(file: File, fileName: string): Promise<ImageOutput> {
    const form = new FormData();
    form.append('file', file);

    const [response, size] = await Promise.all([
      callApi('upscale', 'upscaler', { method: 'POST', body: form }),
      this.processing.getDimensions(file),
    ]);
    const blob = await response.blob();
    return toOutput(blob, size.width * UPSCALE_FACTOR, size.height * UPSCALE_FACTOR, fileName);
  }

  /** `lang` is a Tesseract language code (or several joined by `+`, e.g. `eng+ita`). */
  async recognizeText(file: File, lang: string): Promise<OcrResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('lang', lang);

    const response = await callApi('ocr', 'OCR', { method: 'POST', body: form });
    const api = (await response.json()) as OcrApiResponse;
    return buildOcrResult(file.name, URL.createObjectURL(file), api);
  }

  /** Codes of the Tesseract language packs installed on the server, e.g. `['eng', 'ita']`. */
  async ocrLanguages(): Promise<string[]> {
    const response = await callApi('ocr/languages', 'OCR');
    return ((await response.json()) as { languages: string[] }).languages;
  }
}

function toOutput(blob: Blob, width: number, height: number, fileName: string): ImageOutput {
  return { fileName, blob, url: URL.createObjectURL(blob), size: blob.size, width, height };
}

/**
 * Call `/api/<path>` (a GET unless `init` says otherwise). Any failure becomes
 * an `Error` whose message is shown to the user — the backend's own `detail`
 * text when it sent one, otherwise a generic message naming the `service`.
 */
async function callApi(path: string, service: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, init);
  } catch {
    throw new Error(`The ${service} service is not reachable. Is the backend running?`);
  }
  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new Error(detail ?? `The ${service} service failed (HTTP ${response.status}).`);
  }
  return response;
}

/** FastAPI errors look like `{"detail": "..."}`; return that text when present. */
async function errorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' && body.detail.length > 0 ? body.detail : null;
  } catch {
    return null;
  }
}
