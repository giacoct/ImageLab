import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { OcrService } from '../../core/services/ocr.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';

/**
 * Languages offered in the picker. Each must have its Tesseract language pack
 * installed on the server, or recognition errors out — to add one, add its
 * tesseract-ocr-* package to the Dockerfile *and* an entry here.
 */
export const OCR_LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'ita', label: 'Italian' },
  { code: 'eng+ita', label: 'English + Italian' },
];

@Component({
  selector: 'app-ocr-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './ocr.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ocr extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ocr = inject(OcrService);

  protected readonly toolId = 'ocr';
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

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override get errorMessage(): string {
    return 'The text could not be recognized.';
  }

  protected override runJob(): Promise<void> {
    const { lang } = this.form.getRawValue();
    return this.session.runOcr((file) => this.ocr.recognize(file, { lang }), this.errorMessage);
  }
}
