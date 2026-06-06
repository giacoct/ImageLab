import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-resize-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Resize images"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <div class="tool-fields" [formGroup]="form">
        <div class="settings-grid">
          <div class="field">
            <label for="width">Width</label>
            <input id="width" type="number" min="1" formControlName="width" />
          </div>

          <div class="field">
            <label for="height">Height</label>
            <input id="height" type="number" min="1" formControlName="height" />
          </div>
        </div>

        <label class="check-row">
          <input type="checkbox" formControlName="preserveAspect" />
          Preserve aspect ratio from width
        </label>
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResizeComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'resize';
  protected readonly form = this.fb.group({
    width: [1200, [Validators.required, Validators.min(1)]],
    height: [900, [Validators.required, Validators.min(1)]],
    preserveAspect: [true],
  });

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override async onFilesSelected(files: File[]): Promise<void> {
    try {
      const first = await this.processing.getDimensions(files[0]);
      this.form.patchValue({ width: first.width, height: first.height });
    } catch {
      this.error.set('The selected image could not be read.');
    }
  }

  protected override async processFile(file: File): Promise<ImageOutput> {
    const value = this.form.getRawValue();
    const original = await this.processing.getDimensions(file);
    const format = outputFormatForFile(file);
    const width = Math.max(1, Math.round(value.width));
    const height = value.preserveAspect
      ? Math.max(1, Math.round(width * (original.height / original.width)))
      : Math.max(1, Math.round(value.height));

    return this.processing.renderToBlob(file, {
      width,
      height,
      quality: 1,
      format,
      fileName: renameFile(file.name, 'resized', format),
    });
  }
}
