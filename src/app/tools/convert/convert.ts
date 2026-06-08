import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { OutputFormat } from '../../core/models/image-output.model';
import { JobProcessor } from '../../core/services/tool-session.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';
import { renameFile } from '../../core/utils/image-tool-utils';

@Component({
  selector: 'app-convert-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './convert.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Convert extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'convert';
  protected readonly form = this.fb.group({
    format: this.fb.control<OutputFormat>('image/webp'),
    size: this.fb.control(256),
  });

  constructor() {
    super();
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.session.markStale());
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const { format, size } = this.form.getRawValue();

    return async (file) => {
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
    };
  }
}
