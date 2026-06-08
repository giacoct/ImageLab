import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseTool } from '../shared/base-tool';
import { ToolShell } from '../shared/tool-shell';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-adjust-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './adjust.html',
  styleUrl: '../shared/tool-page.css',
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
  protected readonly cssFilter = computed(() => buildCssFilter(this.formValue()));

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override onFilesSelected(files: File[]): void {
    this.setPreviewUrl(files[0] ? URL.createObjectURL(files[0]) : null);
  }

  override ngOnDestroy(): void {
    this.setPreviewUrl(null);
    super.ngOnDestroy();
  }

  private setPreviewUrl(url: string | null): void {
    const previous = this.previewUrl();
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.previewUrl.set(url);
  }

  protected override processFile(file: File): Promise<ImageOutput> {
    const value = this.form.getRawValue();
    const format = outputFormatForFile(file);

    return this.processing.renderAdjustments(file, {
      ...value,
      quality: 1,
      format,
      fileName: renameFile(file.name, 'adjusted', format),
    });
  }
}

function buildCssFilter(value: {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  blur: number;
  invert: boolean;
}): string {
  const parts = [
    `brightness(${value.brightness}%)`,
    `contrast(${value.contrast}%)`,
    `saturate(${value.saturation}%)`,
  ];

  if (value.grayscale > 0) parts.push(`grayscale(${value.grayscale}%)`);
  if (value.sepia > 0) parts.push(`sepia(${value.sepia}%)`);
  if (value.invert) parts.push('invert(100%)');
  if (value.blur > 0) parts.push(`blur(${value.blur}px)`);

  return parts.join(' ');
}
