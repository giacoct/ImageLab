import { Directive, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ImageToolDefinition } from '../../core/models/image-tool.model';
import { ImageProcessingService } from '../../core/services/image-processing.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { JobProcessor, ToolSessionService } from '../../core/services/tool-session.service';

/**
 * Shared base for a tool's **settings** page. State (files, outputs, progress)
 * lives in {@link ToolSessionService} so it survives the navigation between the
 * import, settings, and output pages.
 *
 * A concrete tool declares its `toolId` and implements `createProcessor`, which
 * snapshots the current settings into a per-file processor. Optional hooks
 * (`isFormValid`, `onFilesSelected`, `errorMessage`) cover the few differences.
 */
@Directive()
export abstract class BaseTool implements OnInit {
  protected readonly processing = inject(ImageProcessingService);
  protected readonly session = inject(ToolSessionService);
  private readonly registry = inject(ToolRegistryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Registry id of the tool, e.g. `'resize'`. */
  protected abstract readonly toolId: string;

  protected readonly files = this.session.files;
  protected readonly isProcessing = this.session.isProcessing;
  protected readonly error = this.session.error;

  /** Index of the file shown in the preview (batch tools with a live preview). */
  protected readonly selectedIndex = signal(0);
  protected readonly selectedFile = computed<File | undefined>(() => {
    const files = this.files();
    return files.length === 0 ? undefined : files[Math.min(this.selectedIndex(), files.length - 1)];
  });

  protected readonly canSubmit = computed(
    () => this.files().length > 0 && !this.isProcessing() && this.isFormValid(),
  );

  private cachedTool?: ImageToolDefinition;
  protected get tool(): ImageToolDefinition {
    return (this.cachedTool ??= this.registry.findById(this.toolId)!);
  }

  ngOnInit(): void {
    this.session.begin(this.tool.id);

    const files = this.files();
    if (files.length === 0) {
      void this.router.navigate(['../import'], { relativeTo: this.route });
      return;
    }

    void this.onFilesSelected(files);
  }

  protected selectFile(index: number): void {
    this.selectedIndex.set(index);
  }

  /** Kick off processing and move straight to the output page. */
  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    void this.session.run(this.createProcessor(), this.errorMessage);
    void this.router.navigate(['../output'], { relativeTo: this.route });
  }

  /** Snapshot the current settings into a per-file processor. */
  protected abstract createProcessor(): JobProcessor;

  /** Whether the settings form (if any) is valid. Override when a form exists. */
  protected isFormValid(): boolean {
    return true;
  }

  /** Hook to react to the selected files, e.g. to prefill the form or preview. */
  protected onFilesSelected(_files: File[]): void | Promise<void> {}

  /** Fallback error message when processing throws a non-Error value. */
  protected get errorMessage(): string {
    return 'The images could not be processed.';
  }
}
