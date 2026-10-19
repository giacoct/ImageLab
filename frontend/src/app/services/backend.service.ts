import { Injectable, inject } from '@angular/core';

import { ImageDimensions, ImageOutput } from '../domain/image-output.model';
import { OcrApiResponse, OcrResult } from '../domain/ocr-result.model';
import { withExtension } from '../domain/image-files';
import { buildOcrResult } from '../domain/ocr-result';
import { UploadLimits, uploadProblem } from '../domain/upload-limits';
import { ImageProcessingService, imageOutput } from './image-processing.service';

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
const UPSCALE_FACTOR = 4;

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
  private limitsRequest?: Promise<UploadLimits>;

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

    await this.assertUploadable(file);
    const [response, size] = await Promise.all([
      callApi('vectorize', 'vectorizer', { method: 'POST', body: form }),
      this.processing.getDimensions(file),
    ]);
    return imageOutput(await response.blob(), size.width, size.height, options.fileName);
  }

  async upscale(file: File, fileName: string): Promise<ImageOutput> {
    const form = new FormData();
    form.append('file', file);

    const size = await this.processing.getDimensions(file);
    await this.assertUploadable(file, size);
    const response = await callApi('upscale', 'upscaler', { method: 'POST', body: form });
    const blob = await response.blob();
    return imageOutput(blob, size.width * UPSCALE_FACTOR, size.height * UPSCALE_FACTOR, fileName);
  }

  /** `lang` is a Tesseract language code (or several joined by `+`, e.g. `eng+ita`). */
  async recognizeText(file: File, lang: string): Promise<OcrResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('lang', lang);

    await this.assertUploadable(file);
    const response = await callApi('ocr', 'OCR', { method: 'POST', body: form });
    const api = (await response.json()) as OcrApiResponse;
    return buildOcrResult(file.name, URL.createObjectURL(file), api);
  }

  /**
   * Convert an HEIC/HEIF photo (which most browsers can't decode) into a JPEG
   * — or PNG if it has transparency — that every tool can work with.
   */
  async convertHeic(file: File): Promise<File> {
    await this.assertUploadable(file);
    const form = new FormData();
    // Some systems leave the type of .heic files empty; the backend needs it.
    form.append('file', new File([file], file.name, { type: file.type || 'image/heic' }));

    const response = await callApi('heic', 'HEIC converter', { method: 'POST', body: form });
    const blob = await response.blob();
    const extension = blob.type === 'image/png' ? 'png' : 'jpg';
    return new File([blob], withExtension(file.name, extension), { type: blob.type });
  }

  /**
   * For each file the backend would reject (too big, or too large to upscale
   * when `forUpscale`), a message saying why — shown on the settings page
   * before anything is sent. Empty if all are fine or the limits are unknown.
   */
  async uploadProblems(files: readonly File[], forUpscale: boolean): Promise<string[]> {
    let limits: UploadLimits;
    try {
      limits = await this.limits();
    } catch {
      return []; // backend unreachable: running the job will report it
    }
    const problems: string[] = [];
    for (const file of files) {
      // Decode one image at a time to keep memory bounded on big batches. An
      // undecodable file is skipped here; running the job reports it.
      const size = forUpscale
        ? await this.processing.getDimensions(file).catch(() => undefined)
        : undefined;
      const problem = uploadProblem(file, limits, size);
      if (problem) problems.push(problem);
    }
    return problems;
  }

  /** Codes of the Tesseract language packs installed on the server, e.g. `['eng', 'ita']`. */
  async ocrLanguages(): Promise<string[]> {
    const response = await callApi('ocr/languages', 'OCR');
    return ((await response.json()) as { languages: string[] }).languages;
  }

  /** The backend's upload limits, fetched once (a failed fetch is retried next time). */
  private limits(): Promise<UploadLimits> {
    this.limitsRequest ??= callApi('limits', 'backend')
      .then((response) => response.json() as Promise<UploadLimits>)
      .catch((error: unknown) => {
        this.limitsRequest = undefined;
        throw error;
      });
    return this.limitsRequest;
  }

  /** Fail fast — without uploading — when the backend would reject the file. */
  private async assertUploadable(file: File, dimensions?: ImageDimensions): Promise<void> {
    const problem = uploadProblem(file, await this.limits(), dimensions);
    if (problem) {
      throw new Error(problem);
    }
  }
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
