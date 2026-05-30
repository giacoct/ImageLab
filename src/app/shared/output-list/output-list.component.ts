import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ImageOutput } from '../../core/models/image-output.model';
import { DownloadService } from '../../core/services/download.service';
import { formatBytes } from '../../tools/shared/image-tool-utils';

@Component({
  selector: 'app-output-list',
  template: `
    @if (outputs().length > 0) {
      <section class="outputs" aria-labelledby="outputs-title">
        <div class="outputs-header">
          <div>
            <h2 id="outputs-title">Output</h2>
            <p>{{ outputs().length }} processed file{{ outputs().length === 1 ? '' : 's' }}</p>
          </div>
          @if (outputs().length > 1) {
            <button class="button secondary" type="button" (click)="downloadAll()">
              Download all
            </button>
          }
        </div>

        <div class="output-grid">
          @for (output of outputs(); track output.url) {
            <article class="output-item">
              <img [src]="output.url" [alt]="output.fileName" />
              <div class="output-body">
                <h3>{{ output.fileName }}</h3>
                <p>{{ output.width }} x {{ output.height }} px | {{ readableSize(output.size) }}</p>
                <button class="button" type="button" (click)="download(output)">Download</button>
              </div>
            </article>
          }
        </div>
      </section>
    }
  `,
  styleUrl: './output-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutputListComponent {
  readonly outputs = input<readonly ImageOutput[]>([]);

  private readonly downloads = inject(DownloadService);

  protected download(output: ImageOutput): void {
    this.downloads.download(output);
  }

  protected downloadAll(): void {
    this.downloads.downloadAll(this.outputs());
  }

  protected readableSize(size: number): string {
    return formatBytes(size);
  }
}
