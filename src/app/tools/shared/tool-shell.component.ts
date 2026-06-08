import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { ImageToolDefinition } from '../../core/models/image-tool.model';
import { FileDropzoneComponent } from '../../shared/file-dropzone/file-dropzone.component';
import { OutputListComponent } from '../../shared/output-list/output-list.component';
import { ProgressRingComponent } from '../../shared/progress-ring/progress-ring.component';

/**
 * Common chrome for a tool page: back link, header, dropzone, selected-files
 * list, settings panel, and the output list. A tool projects its settings
 * fields into the panel and is notified via the `filesSelected` / `process`
 * outputs.
 */
@Component({
  selector: 'app-tool-shell',
  imports: [RouterLink, FileDropzoneComponent, OutputListComponent, ProgressRingComponent],
  template: `
    <a class="back-link" routerLink="/">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      Back to tools
    </a>

    <section class="tool-header">
      <div>
        <div class="tool-title-row">
          <h1>{{ tool().title }}</h1>
          <span class="tool-badge" [class.batch]="tool().batch" [class.single]="!tool().batch">
            {{ tool().batch ? 'Batch' : 'Single' }}
          </span>
        </div>
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
          <app-progress-ring>{{ isProcessing() ? 'Processing...' : actionLabel() }}</app-progress-ring>
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
