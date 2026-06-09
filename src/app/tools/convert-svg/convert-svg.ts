import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { JobProcessor } from '../../core/services/tool-session.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';
import { renameWithExtension } from '../../core/utils/image-tool-utils';

@Component({
  selector: 'app-convert-svg-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './convert-svg.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConvertSvg extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'convert-svg';
  protected readonly form = this.fb.group({
    colors: this.fb.control(8),
    detail: this.fb.control(256),
  });

  constructor() {
    super();
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.session.markStale());
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const { colors, detail } = this.form.getRawValue();

    return (file) =>
      this.processing.renderSvg(file, {
        colors,
        maxDimension: detail,
        fileName: renameWithExtension(file.name, 'vector', 'svg'),
      });
  }

  protected override get errorMessage(): string {
    return 'The images could not be vectorized.';
  }
}
