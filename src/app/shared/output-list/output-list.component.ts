import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { DownloadService } from '../../core/services/download.service';
import { ImagePipelineService } from '../../core/services/image-pipeline.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
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
                @if (chainToolsFor(output).length > 0) {
                  <div class="chain-row">
                    <select
                      #chainTarget
                      [attr.aria-label]="'Use ' + output.fileName + ' in another tool'"
                    >
                      @for (tool of chainToolsFor(output); track tool.id) {
                        <option [value]="tool.id">{{ tool.title }}</option>
                      }
                    </select>
                    <button
                      class="button secondary"
                      type="button"
                      (click)="sendToTool(output, chainTarget.value)"
                    >
                      Use
                    </button>
                  </div>
                }
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
  readonly currentToolId = input('');

  private readonly downloads = inject(DownloadService);
  private readonly pipeline = inject(ImagePipelineService);
  private readonly registry = inject(ToolRegistryService);
  private readonly router = inject(Router);

  protected download(output: ImageOutput): void {
    this.downloads.download(output);
  }

  protected downloadAll(): void {
    this.downloads.downloadAll(this.outputs());
  }

  protected readableSize(size: number): string {
    return formatBytes(size);
  }

  protected chainToolsFor(output: ImageOutput) {
    return this.registry.tools.filter(
      (tool) => tool.id !== this.currentToolId() && tool.acceptedTypes.includes(output.blob.type),
    );
  }

  protected async sendToTool(output: ImageOutput, targetToolId: string): Promise<void> {
    const tool = this.registry.findById(targetToolId);

    if (!tool) {
      return;
    }

    this.pipeline.queue(tool.id, [output]);
    await this.router.navigateByUrl(tool.route);
  }
}
