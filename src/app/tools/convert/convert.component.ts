import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { CanvasOutputFormat, ImageOutput } from '../../core/models/image-output.model';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-convert-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Convert images"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <div class="tool-fields" [formGroup]="form">
        <div class="field">
          <label for="format">Output format</label>
          <select id="format" formControlName="format">
            <option value="image/jpeg">JPEG</option>
            <option value="image/png">PNG</option>
            <option value="image/webp">WebP</option>
          </select>
        </div>
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConvertComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'convert';
  protected readonly form = this.fb.group({
    format: this.fb.control<CanvasOutputFormat>('image/webp'),
  });

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override async processFile(file: File): Promise<ImageOutput> {
    const format = this.form.getRawValue().format;
    const dimensions = await this.processing.getDimensions(file);

    return this.processing.renderToBlob(file, {
      ...dimensions,
      quality: 1,
      format,
      fileName: renameFile(file.name, 'converted', format),
    });
  }
}
