import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { ImageToolDefinition } from '../../core/models/image-tool.model';
import { FileDropzone } from '../../shared/file-dropzone/file-dropzone';
import { OutputList } from '../../shared/output-list/output-list';
import { ProgressRing } from '../../shared/progress-ring/progress-ring';

/**
 * Common chrome for a tool page: back link, header, dropzone, selected-files
 * list, settings panel, and the output list. A tool projects its settings
 * fields into the panel and is notified via the `filesSelected` / `process`
 * outputs.
 */
@Component({
  selector: 'app-tool-shell',
  imports: [RouterLink, FileDropzone, OutputList, ProgressRing],
  templateUrl: './tool-shell.html',
  styleUrl: './tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolShell {
  readonly tool = input.required<ImageToolDefinition>();
  readonly selectedFiles = input.required<readonly File[]>();
  readonly outputs = input.required<readonly ImageOutput[]>();
  readonly isProcessing = input(false);
  readonly error = input('');
  readonly canProcess = input(false);
  readonly actionLabel = input.required<string>();

  readonly filesSelected = output<File[]>();
  readonly process = output<void>();
}
