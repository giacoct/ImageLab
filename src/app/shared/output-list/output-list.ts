import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { ImageToolDefinition } from '../../core/models/image-tool.model';
import { DownloadService } from '../../core/services/download.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { ToolSessionService } from '../../core/services/tool-session.service';
import { formatBytes } from '../../core/utils/image-tool-utils';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-output-list',
  templateUrl: './output-list.html',
  imports: [Icon],
  styleUrl: './output-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closePicker()' },
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

  /** Tools the whole album can chain into — batch tools only, since the set travels together. */
  protected readonly albumChainTargets = computed(() => this.eligibleTools(this.outputs(), true));

  /** Tool-picker modal state. */
  protected readonly pickerOpen = signal(false);
  protected readonly pickerTools = signal<readonly ImageToolDefinition[]>([]);
  private pickerSelection: readonly ImageOutput[] = [];

  protected download(output: ImageOutput): void {
    this.downloads.download(output);
  }

  protected downloadZip(): void {
    void this.downloads.downloadZip(this.outputs(), `imagelab-${this.outputs().length}-images.zip`);
  }

  protected readableSize(size: number): string {
    return formatBytes(size);
  }

  /** Tools a single image can chain into — any tool (incl. single-image ones) that accepts its type. */
  protected singleChainTargets(output: ImageOutput): readonly ImageToolDefinition[] {
    return this.eligibleTools([output], false);
  }

  /** Open the picker for the whole album (all outputs → batch tools). */
  protected openAlbumPicker(): void {
    this.openPicker(this.outputs(), this.albumChainTargets());
  }

  /** Open the picker for one image (that image → any compatible tool). */
  protected openSinglePicker(output: ImageOutput): void {
    this.openPicker([output], this.singleChainTargets(output));
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
  }

  /** Carry the picker's selected outputs into the chosen tool's settings page. */
  protected async chooseTool(tool: ImageToolDefinition): Promise<void> {
    const files = this.pickerSelection.map(
      (output) => new File([output.blob], output.fileName, { type: output.blob.type }),
    );

    this.session.begin(tool.id);
    this.session.setFiles(files);
    this.pickerOpen.set(false);
    await this.router.navigateByUrl(`${tool.route}/settings`);
  }

  private openPicker(
    selection: readonly ImageOutput[],
    tools: readonly ImageToolDefinition[],
  ): void {
    this.pickerSelection = selection;
    this.pickerTools.set(tools);
    this.pickerOpen.set(true);
  }

  /**
   * Tools (other than the current one) that accept every type in `outputs`.
   * `batchOnly` restricts the result to batch tools.
   */
  private eligibleTools(
    outputs: readonly ImageOutput[],
    batchOnly: boolean,
  ): readonly ImageToolDefinition[] {
    const types = [...new Set(outputs.map((output) => output.blob.type))];
    if (types.length === 0) {
      return [];
    }

    return this.registry.tools.filter(
      (tool) =>
        tool.id !== this.currentToolId() &&
        (!batchOnly || tool.batch) &&
        types.every((type) => tool.acceptedTypes.includes(type)),
    );
  }
}
