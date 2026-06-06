import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-strip-metadata-tool',
  imports: [ToolShellComponent],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Strip metadata"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <p class="field-hint">
        Each image is re-encoded in its original format, dropping any embedded metadata.
      </p>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StripMetadataComponent extends BaseToolComponent {
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
