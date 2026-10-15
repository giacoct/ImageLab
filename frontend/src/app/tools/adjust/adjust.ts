import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';

import { buildFilter } from '../../domain/adjustments';
import { outputFormatForFile, renameFile } from '../../domain/image-files';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/**
 * Adjust & filters: brightness, contrast, saturation, grayscale, sepia, invert,
 * blur (all previewed live with the same CSS filter the export uses) and
 * sharpen (export only).
 */
@Component({
  selector: 'app-adjust-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './adjust.html',
  styleUrl: './adjust.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Adjust extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'adjust';
  protected readonly form = this.fb.group({
    brightness: [100, [Validators.required, Validators.min(0), Validators.max(200)]],
    contrast: [100, [Validators.required, Validators.min(0), Validators.max(200)]],
    saturation: [100, [Validators.required, Validators.min(0), Validators.max(200)]],
    grayscale: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    sepia: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    blur: [0, [Validators.required, Validators.min(0), Validators.max(20)]],
    sharpen: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    invert: [false],
  });

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly previewUrl = signal<string | null>(null);
  protected readonly cssFilter = computed(() => buildFilter(this.formValue()));

  constructor() {
    super();
    this.registerForm(this.form);

    // Keep the preview pointed at the selected file; revoke the old object URL.
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

  protected override createProcessor(): JobProcessor {
    const value = this.form.getRawValue();

    return (file) => {
      const format = outputFormatForFile(file);
      return this.processing.renderAdjustments(file, {
        ...value,
        quality: 1,
        format,
        fileName: renameFile(file.name, 'adjusted', format),
      });
    };
  }
}
