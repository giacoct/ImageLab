import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { outputFormatForFile, renameFile } from '../../domain/image-files';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

type ScaleMode = 'percent' | 'fit';

/** Batch scale: resize every image by a percentage, or to fit inside a box. */
@Component({
  selector: 'app-scale-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './scale.html',
  styleUrl: './scale.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Scale extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'scale';
  protected readonly form = this.fb.group({
    mode: this.fb.control<ScaleMode>('percent'),
    percent: [50, [Validators.required, Validators.min(1), Validators.max(200)]],
    fitWidth: [1920, [Validators.required, Validators.min(16)]],
    fitHeight: [1080, [Validators.required, Validators.min(16)]],
  });

  constructor() {
    super();
    this.registerForm(this.form);
  }

  protected override createProcessor(): JobProcessor {
    const { mode, percent, fitWidth, fitHeight } = this.form.getRawValue();

    return (file) => {
      const format = outputFormatForFile(file);
      return this.processing.resize(file, {
        size: ({ width, height }) => {
          const scale =
            mode === 'percent'
              ? percent / 100
              : // Fit within the box without ever upscaling.
                Math.min(fitWidth / width, fitHeight / height, 1);
          return { width: width * scale, height: height * scale };
        },
        quality: 1,
        format,
        fileName: renameFile(file.name, 'scaled', format),
      });
    };
  }
}
