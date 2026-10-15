import { Directive, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';

import { ImageProcessingService } from '../services/image-processing.service';
import { ToolSettingsStore } from '../services/tool-settings.store';
import { JobProcessor, ToolSessionService } from '../services/tool-session.service';
import { ImageToolDefinition, findTool } from '../tool-registry';

/** The slice of a reactive `FormGroup` that settings persistence needs. */
interface PersistableForm {
  valid: boolean;
  valueChanges: Observable<unknown>;
  statusChanges: Observable<unknown>;
  getRawValue(): object;
  patchValue(value: object, options?: { emitEvent?: boolean }): void;
}

/**
 * Shared base for a tool's **settings** page. State (files, outputs, progress)
 * lives in {@link ToolSessionService} so it survives the navigation between the
 * import, settings, and output pages.
 *
 * A concrete tool declares its `toolId`, registers its settings form (if any)
 * with {@link registerForm}, and implements {@link createProcessor}, which
 * snapshots the current settings into a per-file processor. Optional hooks:
 * {@link canRun}, {@link onFilesSelected}, {@link runJob}, {@link errorMessage}.
 */
@Directive()
export abstract class BaseTool implements OnInit {
  protected readonly processing = inject(ImageProcessingService);
  protected readonly session = inject(ToolSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly settings = inject(ToolSettingsStore);

  /** Registry id of the tool, e.g. `'resize'`. */
  protected abstract readonly toolId: string;

  /** Shown when processing throws something that isn't an `Error`. */
  protected readonly errorMessage: string = 'The images could not be processed.';

  protected readonly files = this.session.files;
  protected readonly isProcessing = this.session.isProcessing;
  protected readonly error = this.session.error;

  /** Index of the file shown in the preview (batch tools with a live preview). */
  protected readonly selectedIndex = signal(0);
  protected readonly selectedFile = computed<File | undefined>(() => {
    const files = this.files();
    return files.length === 0 ? undefined : files[Math.min(this.selectedIndex(), files.length - 1)];
  });

  /** Validity of the registered form, tracked as a signal so {@link canSubmit} updates. */
  private readonly formValid = signal(true);

  protected readonly canSubmit = computed(
    () => this.files().length > 0 && !this.isProcessing() && this.formValid() && this.canRun(),
  );

  protected get tool(): ImageToolDefinition {
    return findTool(this.toolId);
  }

  constructor() {
    // React to the selected files — on first load *and* whenever they change
    // later. The page is kept alive between steps (WorkflowReuseStrategy), so
    // after the user changes files on the import step this page is re-attached
    // rather than re-created, and ngOnInit doesn't run again.
    effect(() => {
      const files = this.files();
      untracked(() => void this.onFilesSelected(files));
    });
  }

  ngOnInit(): void {
    this.session.begin(this.tool.id);
    if (this.files().length === 0) {
      void this.router.navigate(['../import'], { relativeTo: this.route });
    }
  }

  protected selectFile(index: number): void {
    this.selectedIndex.set(index);
  }

  /**
   * Wire a settings form into the session: restore the last-used values from
   * storage, then mark outputs stale and persist on every change. Call from
   * the tool's constructor.
   */
  protected registerForm(form: PersistableForm): void {
    const saved = this.settings.load(this.toolId);
    if (saved) {
      form.patchValue(saved);
    }
    this.formValid.set(form.valid);
    form.statusChanges.pipe(takeUntilDestroyed()).subscribe(() => this.formValid.set(form.valid));
    form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.session.markStale();
      this.settings.save(this.toolId, form.getRawValue());
    });
  }

  /**
   * Move to the output page. Only re-runs the job when the results are stale
   * (settings or files changed since the last run); otherwise the existing
   * results are shown as-is.
   */
  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    if (!this.session.resultsFresh()) {
      void this.runJob();
    }
    void this.router.navigate(['../output'], { relativeTo: this.route });
  }

  /**
   * Produce the results for the current files. Defaults to one image per file
   * ({@link createProcessor} → {@link ToolSessionService.run}); tools with a
   * different shape (Merge: one image from all files; OCR: text) override it.
   */
  protected runJob(): Promise<void> {
    return this.session.run(this.createProcessor(), this.errorMessage);
  }

  /**
   * Snapshot the current settings into a per-file image processor. Image tools
   * override this; tools that override {@link runJob} need not.
   */
  protected createProcessor(): JobProcessor {
    throw new Error('createProcessor must be implemented by image-producing tools.');
  }

  /** Extra conditions (beyond a valid form) for enabling the action button; read signals only. */
  protected canRun(): boolean {
    return true;
  }

  /** Hook to react to the selected files, e.g. to decode a preview. Called again when they change. */
  protected onFilesSelected(_files: readonly File[]): void | Promise<void> {}
}
