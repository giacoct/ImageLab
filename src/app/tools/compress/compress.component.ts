import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import {
  clampQuality,
  dimensionsForMaxSize,
  outputFormatForFile,
  renameFile,
} from '../shared/image-tool-utils';

@Component({
  selector: 'app-compress-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Compress images"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <div class="tool-fields" [formGroup]="form">
        <div class="field">
          <label for="maxSize">Maximum side</label>
          <input id="maxSize" type="number" min="320" step="10" formControlName="maxSize" />
          <span class="field-hint">Images smaller than this keep their original dimensions.</span>
        </div>

        <div class="field">
          <label for="quality">Quality: {{ form.controls.quality.value }}%</label>
          <input id="quality" type="range" min="10" max="95" step="5" formControlName="quality" />
        </div>
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompressComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'compress';
  protected readonly form = this.fb.group({
    maxSize: [1600, [Validators.required, Validators.min(320)]],
    quality: [75, [Validators.required, Validators.min(10), Validators.max(95)]],
  });

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override async processFile(file: File): Promise<ImageOutput> {
    const value = this.form.getRawValue();
    const original = await this.processing.getDimensions(file);
    const dimensions = dimensionsForMaxSize(original.width, original.height, value.maxSize);
    const format = outputFormatForFile(file);

    return this.processing.renderToBlob(file, {
      ...dimensions,
      quality: clampQuality(value.quality),
      format,
      fileName: renameFile(file.name, 'compressed', format),
    });
  }
}
