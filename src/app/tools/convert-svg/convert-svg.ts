import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { JobProcessor } from '../../core/services/tool-session.service';
import {
  VectorizeMode,
  VectorizePreset,
  VectorizeService,
} from '../../core/services/vectorize.service';
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
    preset: this.fb.control<VectorizePreset>('auto'),
    // Custom defaults follow user testing: medium color detail, strong cleanup.
    colorPrecision: this.fb.control(6),
    filterSpeckle: this.fb.control(10),
    mode: this.fb.control<VectorizeMode>('spline'),
    // 'smoothness' maps to a (corner_threshold, length_threshold) pair below.
    smoothness: this.fb.control<'crisp' | 'balanced' | 'smooth'>('balanced'),
  });

  /** Curve-fitting presets: rounder curves need a higher corner + length threshold. */
  private readonly smoothnessPresets = {
    crisp: { cornerThreshold: 30, lengthThreshold: 4 },
    balanced: { cornerThreshold: 60, lengthThreshold: 4 },
    smooth: { cornerThreshold: 100, lengthThreshold: 6 },
  } as const;

  constructor() {
    super();
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.session.markStale());
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const { preset, colorPrecision, filterSpeckle, mode, smoothness } = this.form.getRawValue();
    const { cornerThreshold, lengthThreshold } = this.smoothnessPresets[smoothness];

    return (file) =>
      this.vectorize.toSvg(file, {
        preset,
        colorPrecision,
        filterSpeckle,
        mode,
        cornerThreshold,
        lengthThreshold,
        fileName: renameWithExtension(file.name, 'vector', 'svg'),
      });
  }

  protected override get errorMessage(): string {
    return 'The vectorizer service could not be reached.';
  }
}
