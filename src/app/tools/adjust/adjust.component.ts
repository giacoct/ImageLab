import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

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

  protected override isFormValid(): boolean {
    return this.form.valid;
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
