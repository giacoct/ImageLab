import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { JobProcessor } from '../../core/services/tool-session.service';
import { VectorizeMode, VectorizeService } from '../../core/services/vectorize.service';
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
  private readonly vectorize = inject(VectorizeService);

  protected readonly toolId = 'convert-svg';
  protected readonly form = this.fb.group({
    colorPrecision: this.fb.control(6),
    filterSpeckle: this.fb.control(4),
    mode: this.fb.control<VectorizeMode>('spline'),
  });

  constructor() {
    super();
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.session.markStale());
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const { colorPrecision, filterSpeckle, mode } = this.form.getRawValue();

    return (file) =>
      this.vectorize.toSvg(file, {
        colorPrecision,
        filterSpeckle,
        mode,
        fileName: renameWithExtension(file.name, 'vector', 'svg'),
      });
  }

  protected override get errorMessage(): string {
    return 'The vectorizer service could not be reached.';
  }
}
