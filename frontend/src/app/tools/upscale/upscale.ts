import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { renameFile } from '../../domain/image-files';
import { BackendService } from '../../services/backend.service';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/**
 * Upscale: enlarges images 4× with the Real-ESRGAN backend. There are no
 * settings — the model has a fixed scale — so each file is simply posted to
 * the backend and comes back as a PNG.
 */
@Component({
  selector: 'app-upscale-tool',
  imports: [ToolShell],
  templateUrl: './upscale.html',
  styleUrl: './upscale.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Upscale extends BaseTool {
  private readonly backend = inject(BackendService);

  protected readonly toolId = 'upscale';
  protected override readonly errorMessage = 'The image could not be upscaled.';

  protected override createProcessor(): JobProcessor {
    return (file) => this.backend.upscale(file, renameFile(file.name, 'upscaled', 'image/png'));
  }
}
