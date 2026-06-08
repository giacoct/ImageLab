import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseTool } from '../shared/base-tool';
import { ToolShell } from '../shared/tool-shell';
import {
  clampQuality,
  dimensionsForMaxSize,
  outputFormatForFile,
  renameFile,
} from '../shared/image-tool-utils';

@Component({
  selector: 'app-compress-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './compress.html',
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Compress extends BaseTool {
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
