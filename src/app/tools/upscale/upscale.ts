import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { renameFile } from '../../core/utils/image-tool-utils';
import { JobProcessor } from '../../core/services/tool-session.service';
import { UpscaleService } from '../../core/services/upscale.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';

/**
 * Enlarges images 4x with the Real-ESRGAN backend. There are no settings — the
 * model has a fixed scale — so the tool just snapshots a per-file processor that
 * posts to {@link UpscaleService} and lets the shared output pipeline show the
 * PNG result.
 */
@Component({
  selector: 'app-upscale-tool',
  imports: [ToolShell],
  templateUrl: './upscale.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Upscale extends BaseTool {
  private readonly upscale = inject(UpscaleService);

  protected readonly toolId = 'upscale';

  protected override createProcessor(): JobProcessor {
    return (file) =>
      this.upscale.upscale(file, {
        fileName: renameFile(file.name, 'upscaled', 'image/png'),
      });
  }

  protected override get errorMessage(): string {
    return 'The image could not be upscaled.';
  }
}
