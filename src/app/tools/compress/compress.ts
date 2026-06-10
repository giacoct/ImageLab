import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { JobProcessor } from '../../core/services/tool-session.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';
import {
  clampQuality,
  dimensionsForMaxSize,
  outputFormatForFile,
  renameFile,
} from '../../core/utils/image-tool-utils';

type CompressMode = 'quality' | 'target';

/** Binary-search steps; 7 narrows quality to ~0.7% and scale to ~0.7pt. */
const SEARCH_STEPS = 7;

@Component({
  selector: 'app-compress-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './compress.html',
  styleUrl: '../../pages/tool-page.css',
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

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const { mode, maxSize, quality, targetKb } = this.form.getRawValue();

    if (mode === 'target') {
      return (file) => this.renderToTarget(file, maxSize, targetKb * 1024);
    }

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

  /**
   * Compress to (at most) `targetBytes` by binary-searching the quality —
   * or, for PNG where quality has no effect, the dimensions. Returns the
   * largest result that fits, or the smallest achievable one if even that
   * exceeds the target.
   */
  private async renderToTarget(
    file: File,
    maxSize: number,
    targetBytes: number,
  ): Promise<ImageOutput> {
    const original = await this.processing.getDimensions(file);
    const dimensions = dimensionsForMaxSize(original.width, original.height, maxSize);
    const format = outputFormatForFile(file);
    const fileName = renameFile(file.name, 'compressed', format);

    const render = (quality: number, scale = 1): Promise<ImageOutput> =>
      this.processing.renderToBlob(file, {
        width: Math.max(1, Math.round(dimensions.width * scale)),
        height: Math.max(1, Math.round(dimensions.height * scale)),
        quality,
        format,
        fileName,
      });

    const searchesScale = format === 'image/png';
    let low = 0.05;
    let high = searchesScale ? 1 : 0.95;
    let best: ImageOutput | null = null;

    for (let step = 0; step < SEARCH_STEPS; step++) {
      const mid = (low + high) / 2;
      const candidate = searchesScale ? await render(1, mid) : await render(mid);

      if (candidate.size <= targetBytes) {
        // Fits — keep it and search upward for a higher-fidelity fit.
        if (best) {
          this.processing.revoke([best]);
        }
        best = candidate;
        low = mid;
      } else {
        this.processing.revoke([candidate]);
        high = mid;
      }
    }

    // Nothing fit: hand back the smallest the format can produce so the user
    // still gets a result (its size is shown on the output card).
    return best ?? (searchesScale ? render(1, low) : render(low));
  }
}
