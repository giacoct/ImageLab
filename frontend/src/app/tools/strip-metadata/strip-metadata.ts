import { ChangeDetectionStrategy, Component, effect, signal } from '@angular/core';

import { ExifEntry, readExifSummary } from '../../domain/exif-reader';
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

  /** EXIF summary of the selected file; `null` while loading. */
  protected readonly exifEntries = signal<ExifEntry[] | null>(null);

  constructor() {
    super();

    // Show what's embedded in the selected file before it gets stripped.
    effect((onCleanup) => {
      const file = this.selectedFile();
      this.exifEntries.set(null);
      if (!file) {
        return;
      }
      let current = true;
      onCleanup(() => (current = false));
      void readExifSummary(file).then((entries) => {
        if (current) this.exifEntries.set(entries);
      });
    });
  }

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
