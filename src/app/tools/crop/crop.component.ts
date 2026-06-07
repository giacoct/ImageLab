import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { CropAnchor } from '../../core/services/image-processing.service';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-crop-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Crop images"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <div class="tool-fields" [formGroup]="form">
        <div class="field">
          <label for="ratio">Aspect ratio</label>
          <select id="ratio" formControlName="ratio">
            <option value="1:1">Square (1:1)</option>
            <option value="4:3">Standard (4:3)</option>
            <option value="3:2">Photo (3:2)</option>
            <option value="16:9">Widescreen (16:9)</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        @if (form.controls.ratio.value === 'custom') {
          <div class="settings-grid">
            <div class="field">
              <label for="customWidth">Ratio width</label>
              <input id="customWidth" type="number" min="1" formControlName="customWidth" />
            </div>
            <div class="field">
              <label for="customHeight">Ratio height</label>
              <input id="customHeight" type="number" min="1" formControlName="customHeight" />
            </div>
          </div>
        }

        <div class="field">
          <label for="anchor">Anchor</label>
          <select id="anchor" formControlName="anchor">
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
          <span class="field-hint">The largest area of this ratio is kept, positioned here.</span>
        </div>
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CropComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'crop';
  protected readonly form = this.fb.group({
    ratio: ['1:1'],
    customWidth: [1, [Validators.required, Validators.min(1)]],
    customHeight: [1, [Validators.required, Validators.min(1)]],
    anchor: ['center'],
  });

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override processFile(file: File): Promise<ImageOutput> {
    const value = this.form.getRawValue();
    const [aspectWidth, aspectHeight] =
      value.ratio === 'custom'
        ? [Math.max(1, value.customWidth), Math.max(1, value.customHeight)]
        : value.ratio.split(':').map(Number);
    const format = outputFormatForFile(file);

    return this.processing.renderCrop(file, {
      aspectWidth,
      aspectHeight,
      anchor: value.anchor as CropAnchor,
      quality: 1,
      format,
      fileName: renameFile(file.name, 'cropped', format),
    });
  }
}
