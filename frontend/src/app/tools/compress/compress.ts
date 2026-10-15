import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  clampQuality,
  dimensionsForMaxSize,
  outputFormatForFile,
  renameFile,
} from '../../domain/image-files';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

type CompressMode = 'quality' | 'target';

/** Compress: shrink file size at a fixed quality, or to fit a target size. Keeps the format. */
@Component({
  selector: 'app-compress-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './compress.html',
  styleUrl: './compress.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Compress extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'compress';
  protected readonly form = this.fb.group({
    mode: this.fb.control<CompressMode>('quality'),
    maxSize: [1600, [Validators.required, Validators.min(320)]],
    quality: [75, [Validators.required, Validators.min(10), Validators.max(95)]],
    targetKb: [500, [Validators.required, Validators.min(10)]],
  });

  constructor() {
    super();
    this.registerForm(this.form);
  }

  protected override createProcessor(): JobProcessor {
    const { mode, maxSize, quality, targetKb } = this.form.getRawValue();

    return (file) => {
      const format = outputFormatForFile(file);
      const fileName = renameFile(file.name, 'compressed', format);
      if (mode === 'target') {
        return this.processing.compressToSize(file, {
          maxSize,
          targetBytes: targetKb * 1024,
          format,
          fileName,
        });
      }
      return this.processing.resize(file, {
        size: ({ width, height }) => dimensionsForMaxSize(width, height, maxSize),
        quality: clampQuality(quality),
        format,
        fileName,
      });
    };
  }
}
