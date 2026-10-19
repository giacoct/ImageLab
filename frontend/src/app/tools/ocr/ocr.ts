import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { languageLabel } from '../../domain/languages';
import { BackendService } from '../../services/backend.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/**
 * Extract text (OCR): recognizes text with the Tesseract backend. The language
 * pickers list exactly the language packs installed on the server, so adding a
 * language is just installing its pack (see docs/deployment.md).
 */
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
  protected readonly form = this.fb.group({
    language: ['eng', [Validators.required]],
    /** Optional second language recognized together with the first ('' = none). */
    secondLanguage: [''],
  });

  /** Installed languages, sorted by name; empty until loaded. */
  protected readonly languages = signal<readonly { code: string; label: string }[]>([]);
  /** Why the languages couldn't be loaded (e.g. Tesseract missing). */
  protected readonly languagesError = signal('');

  private readonly language = toSignal(this.form.controls.language.valueChanges, {
    initialValue: this.form.controls.language.value,
  });
  /** Choices for the second language: every installed one except the first. */
  protected readonly secondLanguages = computed(() =>
    this.languages().filter((language) => language.code !== this.language()),
  );

  protected readonly previewUrl = this.selectedFileUrl();

  constructor() {
    super();
    this.registerForm(this.form);
    void this.loadLanguages();
  }

  /** Recognition can only start once the installed languages are known. */
  protected override canRun(): boolean {
    return this.languages().length > 0;
  }

  /** OCR produces text, not images, so it uses the session's OCR pipeline. */
  protected override runJob(): Promise<void> {
    const { language, secondLanguage } = this.form.getRawValue();
    const lang =
      secondLanguage && secondLanguage !== language ? `${language}+${secondLanguage}` : language;
    return this.session.runOcr((file) => this.backend.recognizeText(file, lang));
  }

  private async loadLanguages(): Promise<void> {
    try {
      const codes = await this.backend.ocrLanguages();
      this.languages.set(
        codes
          .map((code) => ({ code, label: languageLabel(code) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
      // Saved settings may name a pack that is no longer installed.
      const { language, secondLanguage } = this.form.getRawValue();
      if (!codes.includes(language)) {
        this.form.patchValue({ language: codes.includes('eng') ? 'eng' : (codes[0] ?? '') });
      }
      if (secondLanguage && !codes.includes(secondLanguage)) {
        this.form.patchValue({ secondLanguage: '' });
      }
    } catch (error) {
      this.languagesError.set(error instanceof Error ? error.message : String(error));
    }
  }
}
