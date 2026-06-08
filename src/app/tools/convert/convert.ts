import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { ImageOutput, OutputFormat } from '../../core/models/image-output.model';
import { BaseTool } from '../shared/base-tool';
import { ToolShell } from '../shared/tool-shell';
import { renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-convert-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './convert.html',
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Convert extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'convert';
  protected readonly form = this.fb.group({
    format: this.fb.control<OutputFormat>('image/webp'),
    size: this.fb.control(256),
  });

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override async processFile(file: File): Promise<ImageOutput> {
    const { format, size } = this.form.getRawValue();

    if (format === 'image/x-icon') {
      return this.processing.renderIco(file, {
        size,
        fileName: renameFile(file.name, 'icon', 'image/x-icon'),
      });
    }

    const dimensions = await this.processing.getDimensions(file);

    return this.processing.renderToBlob(file, {
      ...dimensions,
      quality: 1,
      format,
      fileName: renameFile(file.name, 'converted', format),
    });
  }
}
