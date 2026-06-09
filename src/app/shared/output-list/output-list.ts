import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { DownloadService } from '../../core/services/download.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { ToolSessionService } from '../../core/services/tool-session.service';
import { formatBytes } from '../../core/utils/image-tool-utils';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-output-list',
  templateUrl: './output-list.html',
  imports: [NgTemplateOutlet, Icon],
  styleUrl: './output-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutputList {
  readonly outputs = input<readonly ImageOutput[]>([]);
  readonly currentToolId = input('');

  private readonly downloads = inject(DownloadService);
  private readonly session = inject(ToolSessionService);
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

  /** Carry the whole set of outputs into the chosen tool's settings page. */
  protected async sendToTool(targetToolId: string): Promise<void> {
    const tool = this.registry.findById(targetToolId);

    if (!tool) {
      return;
    }

    const files = this.outputs().map(
      (output) => new File([output.blob], output.fileName, { type: output.blob.type }),
    );

    this.session.begin(tool.id);
    this.session.setFiles(files);
    await this.router.navigateByUrl(`${tool.route}/settings`);
  }
}
