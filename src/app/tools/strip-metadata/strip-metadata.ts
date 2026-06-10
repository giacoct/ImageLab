import { ChangeDetectionStrategy, Component, effect, signal } from '@angular/core';

import { JobProcessor } from '../../core/services/tool-session.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';
import { ExifEntry, readExifSummary } from '../../core/utils/exif-reader';
import { outputFormatForFile, renameFile } from '../../core/utils/image-tool-utils';

@Component({
  selector: 'app-strip-metadata-tool',
  imports: [ToolShell],
  templateUrl: './strip-metadata.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StripMetadata extends BaseTool {
  protected readonly toolId = 'strip-metadata';

  /** EXIF summary of the selected file; `null` while loading. */
  protected readonly exifEntries = signal<ExifEntry[] | null>(null);
  private loadToken = 0;

  constructor() {
    super();

    // Show what's embedded in the selected file before it gets stripped.
    effect(() => {
      const file = this.selectedFile();
      const token = ++this.loadToken;
      if (!file) {
        this.exifEntries.set(null);
        return;
      }
      this.exifEntries.set(null);
      void readExifSummary(file).then((entries) => {
        if (token === this.loadToken) {
          this.exifEntries.set(entries);
        }
      });
    });
  }

  protected override createProcessor(): JobProcessor {
    return async (file) => {
      const dimensions = await this.processing.getDimensions(file);
      const format = outputFormatForFile(file);

      return this.processing.renderToBlob(file, {
        ...dimensions,
        quality: 1,
        format,
        fileName: renameFile(file.name, 'clean', format),
      });
    };
  }
}
