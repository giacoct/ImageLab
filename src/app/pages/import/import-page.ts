import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { ToolSessionService } from '../../core/services/tool-session.service';
import { FileDropzone } from '../../shared/file-dropzone/file-dropzone';
import { Icon } from '../../shared/icon/icon';
import { Reorderable } from '../../shared/reorderable/reorderable';
import { StepIndicator } from '../../shared/step-indicator/step-indicator';

/**
 * Generic first step of a tool workflow: pick the images and review the list
 * of imported file names before continuing to the tool's settings.
 */
@Component({
  selector: 'app-import-page',
  imports: [RouterLink, FileDropzone, Icon, StepIndicator, Reorderable],
  templateUrl: './import-page.html',
  styleUrl: '../tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:paste)': 'onPaste($event)' },
})
export class ImportPage {
  /** Bound from the route's `data.toolId`. */
  readonly toolId = input.required<string>();

  private readonly registry = inject(ToolRegistryService);
  private readonly session = inject(ToolSessionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly continueButton = viewChild<ElementRef<HTMLButtonElement>>('continueButton');

  protected readonly tool = computed(() => this.registry.findById(this.toolId())!);
  protected readonly files = this.session.files;
  protected readonly canReorder = computed(() => this.files().length > 1);

  /** Platform-appropriate paste shortcut shown in the hint text. */
  protected readonly pasteShortcut = /Mac|iP(hone|ad|od)/.test(navigator.userAgent)
    ? '⌘V'
    : 'Ctrl+V';

  // Stable, unique key per File instance so the list can track duplicates
  // (same name + size) without colliding. Keyed by object reference, which is
  // always distinct since every import/paste produces fresh File objects.
  private readonly fileKeys = new WeakMap<File, number>();
  private nextFileKey = 0;

  constructor() {
    // Start (or resume) the session for this tool. `begin` only clears state
    // when the tool actually changes, so returning here keeps the selection.
    effect(() => this.session.begin(this.toolId()));
  }

  protected onFilesSelected(files: File[]): void {
    this.addFiles(files);
  }

  /**
   * Append images pasted from the clipboard (e.g. a screenshot or a copied
   * image file). Clipboard images all arrive named "image.png", so each is
   * given a unique name to keep the rows distinguishable.
   */
  protected onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }

    const accepted = new Set(this.tool().acceptedTypes);
    const pasted: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') {
        continue;
      }
      const file = item.getAsFile();
      if (file && accepted.has(file.type)) {
        const extension = file.type.split('/')[1] ?? 'png';
        pasted.push(
          new File([file], `pasted-${Date.now()}-${pasted.length + 1}.${extension}`, {
            type: file.type,
          }),
        );
      }
    }

    if (pasted.length > 0) {
      event.preventDefault();
      this.addFiles(pasted);
    }
  }

  protected removeFile(index: number): void {
    this.session.removeFile(index);
  }

  /** Stable track key for a selected file (see {@link fileKeys}). */
  protected fileKey(file: File): number {
    let key = this.fileKeys.get(file);
    if (key === undefined) {
      key = this.nextFileKey++;
      this.fileKeys.set(file, key);
    }
    return key;
  }

  protected clearFiles(): void {
    this.session.setFiles([]);
  }

  /** Append the given files to the selection (capped to a single-file tool's max). */
  private addFiles(files: File[]): void {
    const max = this.tool().maxFiles;
    // A single-file tool replaces rather than appends; batch tools accumulate.
    if (max === 1) {
      this.session.setFiles(files.slice(0, 1));
    } else {
      this.session.addFiles(files, max);
    }

    // Reveal the Continue button once the imported list has rendered.
    afterNextRender(
      () =>
        this.continueButton()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' }),
      { injector: this.injector },
    );
  }

  protected continue(): void {
    if (this.files().length > 0) {
      void this.router.navigateByUrl(`${this.tool().route}/settings`);
    }
  }

  protected moveFile(from: number, to: number): void {
    this.session.moveFile(from, to);
  }
}
