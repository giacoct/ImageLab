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
import { StepIndicator } from '../../shared/step-indicator/step-indicator';

/**
 * Generic first step of a tool workflow: pick the images and review the list
 * of imported file names before continuing to the tool's settings.
 */
@Component({
  selector: 'app-import-page',
  imports: [RouterLink, FileDropzone, StepIndicator],
  templateUrl: './import-page.html',
  styleUrl: './tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  constructor() {
    // Start (or resume) the session for this tool. `begin` only clears state
    // when the tool actually changes, so returning here keeps the selection.
    effect(() => this.session.begin(this.toolId()));
  }

  protected onFilesSelected(files: File[]): void {
    const max = this.tool().maxFiles;
    this.session.setFiles(max != null ? files.slice(0, max) : files);

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
}
