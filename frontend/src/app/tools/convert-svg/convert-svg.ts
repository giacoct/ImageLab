import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { renameWithExtension } from '../../domain/image-files';
import { BackendService, VectorizeMode, VectorizePreset } from '../../services/backend.service';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/** Curve-fitting presets: rounder curves need a higher corner + length threshold. */
const SMOOTHNESS = {
  crisp: { cornerThreshold: 30, lengthThreshold: 4 },
  balanced: { cornerThreshold: 60, lengthThreshold: 4 },
  smooth: { cornerThreshold: 100, lengthThreshold: 6 },
} as const;

/** Convert to SVG: traces images into vectors with the VTracer backend. */
@Component({
  selector: 'app-convert-svg-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './convert-svg.html',
  styleUrl: './convert-svg.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConvertSvg extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly backend = inject(BackendService);

  protected readonly toolId = 'convert-svg';
  protected override readonly errorMessage = 'The vectorizer service could not be reached.';
  protected readonly form = this.fb.group({
    preset: this.fb.control<VectorizePreset>('auto'),
    // Custom defaults follow user testing: medium color detail, strong cleanup.
    colorPrecision: this.fb.control(6),
    filterSpeckle: this.fb.control(10),
    mode: this.fb.control<VectorizeMode>('spline'),
    smoothness: this.fb.control<keyof typeof SMOOTHNESS>('balanced'),
  });

  constructor() {
    super();
    this.registerForm(this.form);
  }

  protected override createProcessor(): JobProcessor {
    const { preset, colorPrecision, filterSpeckle, mode, smoothness } = this.form.getRawValue();

    return (file) =>
      this.backend.vectorize(file, {
        preset,
        colorPrecision,
        filterSpeckle,
        mode,
        ...SMOOTHNESS[smoothness],
        fileName: renameWithExtension(file.name, 'vector', 'svg'),
      });
  }
}
