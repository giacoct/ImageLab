import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { JobProcessor } from '../../core/services/tool-session.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';
import { outputFormatForFile, renameFile } from '../../core/utils/image-tool-utils';

type ScaleMode = 'percent' | 'fit';

@Component({
  selector: 'app-scale-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './scale.html',
  styleUrl: '../../pages/tool-page.css',
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

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const { mode, percent, fitWidth, fitHeight } = this.form.getRawValue();

    return async (file) => {
      const original = await this.processing.getDimensions(file);
      const scale =
        mode === 'percent'
          ? percent / 100
          : // Fit within the box without ever upscaling.
            Math.min(fitWidth / original.width, fitHeight / original.height, 1);
      const format = outputFormatForFile(file);

      return this.processing.renderToBlob(file, {
        width: Math.max(1, Math.round(original.width * scale)),
        height: Math.max(1, Math.round(original.height * scale)),
        quality: 1,
        format,
        fileName: renameFile(file.name, 'scaled', format),
      });
    };
  }
}
