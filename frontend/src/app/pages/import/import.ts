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

import { ToolSessionService } from '../../services/tool-session.service';
import { FileDropzone } from '../../shared/file-dropzone/file-dropzone';
import { FileList } from '../../shared/file-list/file-list';
import { Icon } from '../../shared/icon/icon';
import { ToolHeader } from '../../shared/tool-header/tool-header';
import { ACCEPTED_TYPES, findTool } from '../../tool-registry';

/**
 * Step 1 of every tool: pick images (browse, drop, or paste), review and
 * reorder the list, then continue to the tool's settings.
 */
@Component({
  selector: 'app-import-page',
  imports: [RouterLink, FileDropzone, FileList, Icon, ToolHeader],
  templateUrl: './import.html',
  styleUrl: './import.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:paste)': 'onPaste($event)' },
})
export class ImportPage {
  /** Bound from the route's `data.toolId`. */
  readonly toolId = input.required<string>();

  private readonly session = inject(ToolSessionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly continueButton = viewChild<ElementRef<HTMLButtonElement>>('continueButton');

  protected readonly tool = computed(() => findTool(this.toolId()));
  protected readonly files = this.session.files;

  constructor() {
    // Start (or resume) the session for this tool. `begin` only clears state
    // when the tool actually changes, so returning here keeps the selection.
    effect(() => this.session.begin(this.toolId()));
  }

  /**
   * Add images pasted from the clipboard (e.g. a screenshot or a copied image
   * file). Clipboard images all arrive named "image.png", so each gets a
   * unique name to keep the rows distinguishable.
   */
  protected onPaste(event: ClipboardEvent): void {
    const pasted: File[] = [];
    for (const item of Array.from(event.clipboardData?.items ?? [])) {
      const file = item.kind === 'file' ? item.getAsFile() : null;
      if (file && ACCEPTED_TYPES.includes(file.type)) {
        const extension = file.type.split('/')[1];
        const name = `pasted-${Date.now()}-${pasted.length + 1}.${extension}`;
        pasted.push(new File([file], name, { type: file.type }));
      }
    }

    if (pasted.length > 0) {
      event.preventDefault();
      this.addFiles(pasted);
    }
  }

  /** Batch tools accumulate files; a single-image tool replaces its one file. */
  protected addFiles(files: File[]): void {
    if (this.tool().batch) {
      this.session.addFiles(files);
    } else if (files.length > 0) {
      this.session.setFiles(files.slice(0, 1));
    }

    // Reveal the Continue button once the imported list has rendered.
    afterNextRender(
      () =>
        this.continueButton()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' }),
      { injector: this.injector },
    );
  }

  protected removeFile(index: number): void {
    this.session.removeFile(index);
  }

  protected clearFiles(): void {
    this.session.setFiles([]);
  }

  protected continue(): void {
    if (this.files().length > 0) {
      void this.router.navigateByUrl(`${this.tool().route}/settings`);
    }
  }
}
