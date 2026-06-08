import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { JobProcessor } from '../../core/services/tool-session.service';
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

  protected override createProcessor(): JobProcessor {
    const { maxSize, quality } = this.form.getRawValue();

    return async (file) => {
      const original = await this.processing.getDimensions(file);
      const dimensions = dimensionsForMaxSize(original.width, original.height, maxSize);
      const format = outputFormatForFile(file);

      return this.processing.renderToBlob(file, {
        ...dimensions,
        quality: clampQuality(quality),
        format,
        fileName: renameFile(file.name, 'compressed', format),
      });
    };
  }
}
