import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { OcrApiResponse, OcrResult } from '../models/ocr-result.model';
import { buildOcrResult } from '../utils/ocr-result';

export interface OcrOptions {
  /** Tesseract language code(s), e.g. `eng` or `eng+fra`. */
  lang: string;
}

/**
 * Recognizes text by delegating to the backend OCR endpoint (Tesseract,
 * proxied at `/api/ocr`), mirroring how {@link VectorizeService} talks to the
 * tracer. The response carries per-word boxes, which the result page renders as
 * a selectable text layer over the image.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  private readonly http = inject(HttpClient);

  async recognize(file: File, options: OcrOptions): Promise<OcrResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('lang', options.lang);

    const api = await this.postOcr(form);
    return buildOcrResult(file.name, URL.createObjectURL(file), api);
  }

  private async postOcr(form: FormData): Promise<OcrApiResponse> {
    try {
      return await firstValueFrom(this.http.post<OcrApiResponse>('/api/ocr', form));
    } catch (error) {
      throw new Error(describeOcrError(error));
    }
  }
}

/** Build a user-facing message, preferring the backend's own `detail` text. */
function describeOcrError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'The OCR service is not reachable. Please try again later.';
    }
    const detail: unknown = error.error?.detail;
    if (typeof detail === 'string' && detail.length > 0) {
      return detail;
    }
    return `The OCR service failed (HTTP ${error.status}).`;
  }
  return 'The text could not be recognized.';
}
