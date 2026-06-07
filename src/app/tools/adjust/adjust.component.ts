import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-adjust-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Apply adjustments"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      @if (previewUrl()) {
        <section preview class="tool-preview panel" aria-label="Live preview">
          <h2>Preview</h2>
          <div class="preview-stage">
            <img [src]="previewUrl()" [style.filter]="cssFilter()" alt="Adjusted preview" />
          </div>
        </section>
      }

      <div class="tool-fields" [formGroup]="form">
        <div class="field">
          <label for="brightness">Brightness: {{ form.controls.brightness.value }}%</label>
          <input
            id="brightness"
            type="range"
            min="0"
            max="200"
            step="1"
            formControlName="brightness"
          />
        </div>

        <div class="field">
          <label for="contrast">Contrast: {{ form.controls.contrast.value }}%</label>
          <input id="contrast" type="range" min="0" max="200" step="1" formControlName="contrast" />
        </div>

        <div class="field">
          <label for="saturation">Saturation: {{ form.controls.saturation.value }}%</label>
          <input
            id="saturation"
            type="range"
            min="0"
            max="200"
            step="1"
            formControlName="saturation"
          />
        </div>

        <div class="field">
          <label for="grayscale">Grayscale: {{ form.controls.grayscale.value }}%</label>
          <input
            id="grayscale"
            type="range"
            min="0"
            max="100"
            step="1"
            formControlName="grayscale"
          />
        </div>

        <div class="field">
          <label for="sepia">Sepia: {{ form.controls.sepia.value }}%</label>
          <input id="sepia" type="range" min="0" max="100" step="1" formControlName="sepia" />
        </div>

        <div class="field">
          <label for="blur">Blur: {{ form.controls.blur.value }}px</label>
          <input id="blur" type="range" min="0" max="20" step="1" formControlName="blur" />
        </div>

        <div class="field">
          <label for="sharpen">Sharpen: {{ form.controls.sharpen.value }}%</label>
          <input id="sharpen" type="range" min="0" max="100" step="1" formControlName="sharpen" />
          <span class="field-hint">Sharpen is applied on export and not shown in the preview.</span>
        </div>

        <label class="check-row">
          <input type="checkbox" formControlName="invert" />
          Invert colors
        </label>
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjustComponent extends BaseToolComponent {
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
