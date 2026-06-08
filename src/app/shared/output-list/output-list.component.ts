import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
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
          <h2 id="outputs-title">Output</h2>
        </div>

        @if (isBatch()) {
          <article class="output-item album-card">
            <div class="album-stack" aria-hidden="true">
              @for (output of stackPreview(); track output.url; let i = $index) {
                <img class="album-img" [src]="output.url" alt="" [style.--i]="i" />
              }
              <span class="album-badge">{{ outputs().length }}</span>
            </div>
            <div class="output-body">
              <h3>{{ outputs().length }} images</h3>
              <p>{{ readableSize(totalSize()) }} · ZIP archive</p>
              <div class="action-row">
                <button class="button" type="button" (click)="downloadZip()">
                  Download ZIP
                </button>
                <ng-container [ngTemplateOutlet]="chainControl" />
              </div>
            </div>
          </article>
        } @else {
          @for (output of outputs(); track output.url) {
            <article class="output-item">
              <img [src]="output.url" [alt]="output.fileName" />
              <div class="output-body">
                <h3>{{ output.fileName }}</h3>
                <p>{{ output.width }} x {{ output.height }} px | {{ readableSize(output.size) }}</p>
                <div class="action-row">
                  <button class="button" type="button" (click)="download(output)">Download</button>
                  <ng-container [ngTemplateOutlet]="chainControl" />
                </div>
              </div>
            </article>
          }
        }
      </section>
    }

    <ng-template #chainControl>
      @if (chainTargets().length > 0) {
        <div class="chain-row">
          <select #chainTarget aria-label="Use these images in another tool">
            @for (tool of chainTargets(); track tool.id) {
              <option [value]="tool.id">{{ tool.title }}</option>
            }
          </select>
          <button class="button secondary" type="button" (click)="sendToTool(chainTarget.value)">
            Use
          </button>
        </div>
      }
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
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

  protected readonly isBatch = computed(() => this.outputs().length > 1);
  protected readonly stackPreview = computed(() => this.outputs().slice(0, 4));
  protected readonly totalSize = computed(() =>
    this.outputs().reduce((sum, output) => sum + output.size, 0),
  );

  private readonly distinctTypes = computed(() => [
    ...new Set(this.outputs().map((output) => output.blob.type)),
  ]);

  /** Tools (other than the current one) that accept every type in the batch. */
  protected readonly chainTargets = computed(() => {
    const types = this.distinctTypes();
    if (types.length === 0) {
      return [];
    }

    // With more than one image, drop single-image tools — they can't take the batch.
    const allowMultiple = this.outputs().length > 1;

    return this.registry.tools.filter(
      (tool) =>
        tool.id !== this.currentToolId() &&
        (!allowMultiple || tool.maxFiles !== 1) &&
        types.every((type) => tool.acceptedTypes.includes(type)),
    );
  });

  protected download(output: ImageOutput): void {
    this.downloads.download(output);
  }

  protected downloadZip(): void {
    void this.downloads.downloadZip(this.outputs(), `imagelab-${this.outputs().length}-images.zip`);
  }

  protected readableSize(size: number): string {
    return formatBytes(size);
  }

  /** Send the whole set of outputs into the chosen tool. */
  protected async sendToTool(targetToolId: string): Promise<void> {
    const tool = this.registry.findById(targetToolId);

    if (!tool) {
      return;
    }

    this.pipeline.queue(tool.id, this.outputs());
    await this.router.navigateByUrl(tool.route);
  }
}
