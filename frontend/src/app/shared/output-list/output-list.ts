import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { formatBytes } from '../../domain/image-files';
import { ImageOutput } from '../../domain/image-output.model';
import { DownloadService } from '../../services/download.service';
import { ToolSessionService } from '../../services/tool-session.service';
import { ACCEPTED_TYPES, ImageToolDefinition, TOOLS } from '../../tool-registry';
import { Icon } from '../icon/icon';
import { Reorderable } from '../reorderable/reorderable';
import { ToolCard } from '../tool-card/tool-card';

/**
 * The produced images on the output page: one card per image (rename,
 * download, chain into another tool) plus, for batches, an "album" card that
 * downloads everything as a ZIP or chains the whole set. Cards can be
 * drag-reordered, which sets the order inside the ZIP.
 */
@Component({
  selector: 'app-output-list',
  templateUrl: './output-list.html',
  imports: [Icon, Reorderable, ToolCard],
  styleUrl: './output-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closePicker()' },
})
export class OutputList {
  readonly outputs = input<readonly ImageOutput[]>([]);
  readonly currentToolId = input('');

  private readonly downloads = inject(DownloadService);
  private readonly session = inject(ToolSessionService);
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

  /** Inline-rename state: index of the card being renamed. */
  protected readonly editingIndex = signal<number | null>(null);

  protected startRename(index: number): void {
    this.editingIndex.set(index);
  }

  protected cancelRename(): void {
    this.editingIndex.set(null);
  }

  protected commitRename(index: number, value: string): void {
    if (this.editingIndex() !== index) {
      return;
    }
    this.editingIndex.set(null);

    const current = this.outputs()[index];
    if (!current) {
      return;
    }
    const fileName = normalizeFileName(value, current.fileName);
    if (fileName !== current.fileName) {
      this.session.renameOutput(index, fileName);
    }
  }

  protected moveOutput(from: number, to: number): void {
    this.session.moveOutput(from, to);
  }

  protected download(output: ImageOutput): void {
    this.downloads.download(output);
  }

  protected downloadZip(): void {
    const entries = this.outputs().map((output) => ({ name: output.fileName, blob: output.blob }));
    void this.downloads.downloadZip(entries, `imagelab-${entries.length}-images.zip`);
  }

  protected readonly formatBytes = formatBytes;

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
   * Tools (other than the current one) that can take `outputs` as input — none
   * when an output isn't a raster image tools accept (e.g. SVG or ICO).
   * `batchOnly` restricts the result to batch tools.
   */
  private eligibleTools(
    outputs: readonly ImageOutput[],
    batchOnly: boolean,
  ): readonly ImageToolDefinition[] {
    if (
      outputs.length === 0 ||
      outputs.some((output) => !ACCEPTED_TYPES.includes(output.blob.type))
    ) {
      return [];
    }
    return TOOLS.filter((tool) => tool.id !== this.currentToolId() && (!batchOnly || tool.batch));
  }
}

/**
 * Sanitize a user-typed file name: fall back to the old name when emptied,
 * and re-append the original extension when it was dropped.
 */
function normalizeFileName(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.includes('.')) {
    return trimmed;
  }
  const dot = fallback.lastIndexOf('.');
  return dot === -1 ? trimmed : `${trimmed}${fallback.slice(dot)}`;
}
