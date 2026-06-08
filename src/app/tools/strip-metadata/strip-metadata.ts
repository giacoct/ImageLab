import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseTool } from '../shared/base-tool';
import { ToolShell } from '../shared/tool-shell';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-strip-metadata-tool',
  imports: [ToolShell],
  templateUrl: './strip-metadata.html',
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StripMetadata extends BaseTool {
  protected readonly toolId = 'strip-metadata';

  protected override async processFile(file: File): Promise<ImageOutput> {
    const dimensions = await this.processing.getDimensions(file);
    const format = outputFormatForFile(file);

    return this.processing.renderToBlob(file, {
      ...dimensions,
      quality: 1,
      format,
      fileName: renameFile(file.name, 'clean', format),
    });
  }
}
