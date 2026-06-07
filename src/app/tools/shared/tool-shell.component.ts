import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { ImageToolDefinition } from '../../core/models/image-tool.model';
import { FileDropzoneComponent } from '../../shared/file-dropzone/file-dropzone.component';
import { OutputListComponent } from '../../shared/output-list/output-list.component';

/**
 * Common chrome for a tool page: back link, header, dropzone, selected-files
 * list, settings panel, and the output list. A tool projects its settings
 * fields into the panel and is notified via the `filesSelected` / `process`
 * outputs.
 */
@Component({
  selector: 'app-tool-shell',
  imports: [RouterLink, FileDropzoneComponent, OutputListComponent],
  template: `
    <a class="back-link" routerLink="/"> « Back to tools</a>

    <section class="tool-header">
      <div>
        <p class="eyebrow">Tool</p>
        <h1>{{ tool().title }}</h1>
      </div>
      <p>{{ tool().description }}</p>
    </section>

    <div class="tool-workspace">
      <div class="input-column">
        <app-file-dropzone
          [acceptedTypes]="tool().acceptedTypes"
          [multiple]="tool().maxFiles !== 1"
          (filesSelected)="filesSelected.emit($event)"
        />

        <ng-content select="[preview]" />

        @if (selectedFiles().length > 0) {
          <section class="file-list panel" aria-label="Selected files">
            <h2>Selected files</h2>
            @for (file of selectedFiles(); track file.name + file.size) {
              <p>{{ file.name }}</p>
            }
          </section>
        }
      </div>

      <section class="settings panel">
        <h2>Settings</h2>

        <ng-content />

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button class="button" type="button" [disabled]="!canProcess()" (click)="process.emit()">
          {{ isProcessing() ? 'Processing...' : actionLabel() }}
        </button>
      </section>
    </div>

    <app-output-list [outputs]="outputs()" [currentToolId]="tool().id" />
  `,
  styleUrl: './tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolShellComponent {
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
