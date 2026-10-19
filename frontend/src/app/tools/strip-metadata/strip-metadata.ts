import { ChangeDetectionStrategy, Component, resource } from '@angular/core';

import { readExifSummary } from '../../domain/exif-reader';
import { outputFormatForFile, renameFile } from '../../domain/image-files';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/**
 * Strip metadata: shows the selected image's EXIF summary, then re-encodes
 * every image in its own format — re-encoding through a canvas drops all
 * embedded metadata.
 */
@Component({
  selector: 'app-strip-metadata-tool',
  imports: [ToolShell],
  templateUrl: './strip-metadata.html',
  styleUrl: './strip-metadata.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StripMetadata extends BaseTool {
  protected readonly toolId = 'strip-metadata';

  /** What's embedded in the selected file, shown before it gets stripped. */
  protected readonly exif = resource({
    params: () => this.selectedFile(),
    loader: ({ params: file }) => readExifSummary(file),
  });

  protected override createProcessor(): JobProcessor {
    return (file) => {
      const format = outputFormatForFile(file);
      return this.processing.resize(file, {
        quality: 1,
        format,
        fileName: renameFile(file.name, 'clean', format),
      });
    };
  }
}
