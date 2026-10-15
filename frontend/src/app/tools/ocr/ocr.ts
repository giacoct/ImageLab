import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { BackendService } from '../../services/backend.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/**
 * Languages offered in the picker. Each needs its Tesseract language pack on
 * the server, or recognition fails — to add one, install its
 * `tesseract-ocr-<code>` package (see docs/deployment.md), add it here, and
 * add it to OCR_LANGS in scripts/setup.mjs.
 */
export const OCR_LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'ita', label: 'Italian' },
  { code: 'eng+ita', label: 'English + Italian' },
];

/** Extract text (OCR): recognizes text with the Tesseract backend. */
@Component({
  selector: 'app-ocr-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './ocr.html',
  styleUrl: './ocr.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ocr extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly backend = inject(BackendService);

  protected readonly toolId = 'ocr';
  protected override readonly errorMessage = 'The text could not be recognized.';
  protected readonly languages = OCR_LANGUAGES;
  protected readonly form = this.fb.group({
    lang: ['eng', [Validators.required]],
  });

  /** Object URL of the selected file, shown as a plain preview. */
  protected readonly previewUrl = signal<string | null>(null);

  constructor() {
    super();
    this.registerForm(this.form);

    effect((onCleanup) => {
      const file = this.selectedFile();
      if (!file) {
        this.previewUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(file);
      this.previewUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  /** OCR produces text, not images, so it uses the session's OCR pipeline. */
  protected override runJob(): Promise<void> {
    const { lang } = this.form.getRawValue();
    return this.session.runOcr((file) => this.backend.recognizeText(file, lang), this.errorMessage);
  }
}
