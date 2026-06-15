import { Injectable, computed, inject, signal } from '@angular/core';

import { ImageOutput } from '../models/image-output.model';
import { OcrResult } from '../models/ocr-result.model';
import { ImageProcessingService } from './image-processing.service';
import { WorkflowReuseStrategy } from './workflow-reuse.strategy';

/** Produces one output for a single input file. Snapshots its settings up front. */
export type JobProcessor = (file: File) => Promise<ImageOutput>;

/** Produces recognized text + boxes for a single input file (the OCR tool). */
export type OcrProcessor = (file: File) => Promise<OcrResult>;

/** Hooks that let one batch loop drive both the image and OCR pipelines. */
interface BatchSink<T> {
  /** Clear any prior results before the run starts. */
  reset(): void;
  /** Store the finished results (the run completed without being abandoned). */
  settle(results: T[]): void;
  /** Release results from a run that was cancelled mid-flight. */
  abandon(results: T[]): void;
}

export interface JobProgress {
  total: number;
  completed: number;
  currentFileName: string;
}

/** A job must be projected to run longer than this to reveal the progress bar. */
const BAR_THRESHOLD_MS = 1000;

/**
 * Single source of truth for an in-flight tool workflow (import → settings →
 * output). State lives here rather than in the page components so it survives
 * the navigation between the three pages, and so the batch loop keeps running
 * after the settings page is destroyed.
 */
@Injectable({ providedIn: 'root' })
export class ToolSessionService {
  private readonly processing = inject(ImageProcessingService);
  private readonly reuse = inject(WorkflowReuseStrategy);

  readonly toolId = signal<string | null>(null);
  readonly files = signal<File[]>([]);
  readonly outputs = signal<ImageOutput[]>([]);
  /** Text results, for the OCR tool (parallel to {@link outputs}). */
  readonly ocrResults = signal<OcrResult[]>([]);
  readonly isProcessing = signal(false);
  readonly error = signal('');
  readonly job = signal<JobProgress | null>(null);

  /** True once settings/files change after a run, until the job is re-run. */
  readonly outputStale = signal(false);

  /** Latched once a job is judged slow, so the bar stays visible through 100%. */
  private readonly barLatched = signal(false);
  private startedAt = 0;
  /** Bumped to cancel an in-flight run (e.g. on reset). */
  private runId = 0;

  readonly percent = computed(() => {
    const job = this.job();
    return job && job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  });

  /** Show the bar only for jobs projected to exceed the threshold. */
  readonly showProgressBar = computed(() => this.isProcessing() && this.barLatched());

  /** Whether the current image outputs still reflect the current settings + files. */
  readonly outputsFresh = computed(() => this.outputs().length > 0 && !this.outputStale());

  /** Whether any results (image or text) are present and up to date. */
  readonly resultsFresh = computed(
    () => (this.outputs().length > 0 || this.ocrResults().length > 0) && !this.outputStale(),
  );

  /** Step pages the user is allowed to jump to (import is always reachable). */
  readonly canVisitSettings = computed(() => this.files().length > 0);
  readonly canVisitOutput = this.resultsFresh;

  /** Switch to a tool, clearing any prior session state. */
  begin(toolId: string): void {
    if (this.toolId() === toolId) {
      return;
    }
    this.toolId.set(toolId);
    this.reset();
  }

  setFiles(files: File[]): void {
    this.replaceOutputs([]);
    this.replaceOcrResults([]);
    this.error.set('');
    this.files.set(files);
  }

  /** Reorder the selected files (drag-reorder on the import step). */
  moveFile(from: number, to: number): void {
    let moved = false;
    this.files.update((files) => {
      if (from < 0 || from >= files.length || to < 0 || to >= files.length || from === to) {
        return files;
      }
      const next = [...files];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      moved = true;
      return next;
    });
    // The produced results no longer match the new order; re-run on next visit.
    if (moved) {
      this.markStale();
    }
  }

  /** Mark the produced outputs out of date (settings changed since the run). */
  markStale(): void {
    this.outputStale.set(true);
  }

  /** Run an image processor over every selected file, collecting the outputs. */
  run(
    processor: JobProcessor,
    fallbackMessage = 'The images could not be processed.',
  ): Promise<void> {
    return this.runBatch(processor, fallbackMessage, {
      reset: () => this.replaceOutputs([]),
      settle: (results) => {
        this.outputs.set(results);
        this.outputStale.set(false);
      },
      abandon: (results) => this.processing.revoke(results),
    });
  }

  /** Run the OCR processor over every selected file, collecting the text results. */
  runOcr(
    processor: OcrProcessor,
    fallbackMessage = 'The text could not be recognized.',
  ): Promise<void> {
    return this.runBatch(processor, fallbackMessage, {
      reset: () => this.replaceOcrResults([]),
      settle: (results) => {
        this.ocrResults.set(results);
        this.outputStale.set(false);
      },
      abandon: (results) => this.revokeOcrResults(results),
    });
  }

  /**
   * Shared batch loop: runs `process` over every file with progress, mid-flight
   * cancellation, and per-file failure collection. A {@link BatchSink} adapts it
   * to whichever result type the tool produces (image outputs or OCR text).
   */
  private async runBatch<T>(
    process: (file: File) => Promise<T>,
    fallbackMessage: string,
    sink: BatchSink<T>,
  ): Promise<void> {
    const files = this.files();
    if (files.length === 0 || this.isProcessing()) {
      return;
    }

    const runId = ++this.runId;
    this.isProcessing.set(true);
    this.error.set('');
    sink.reset();
    this.barLatched.set(false);
    this.startedAt = Date.now();
    this.job.set({ total: files.length, completed: 0, currentFileName: files[0].name });

    const results: T[] = [];
    const failures: { fileName: string; message: string }[] = [];

    try {
      let processed = 0;
      for (const file of files) {
        this.job.update((job) => (job ? { ...job, currentFileName: file.name } : job));

        let result: T | null = null;
        try {
          result = await process(file);
        } catch (error) {
          failures.push({
            fileName: file.name,
            message: error instanceof Error ? error.message : fallbackMessage,
          });
        }

        // Abandoned mid-flight (the session was reset or restarted).
        if (runId !== this.runId) {
          sink.abandon(result !== null ? [...results, result] : results);
          return;
        }

        if (result !== null) {
          results.push(result);
        }
        processed++;
        this.job.update((job) => (job ? { ...job, completed: processed } : job));
        this.evaluateBar();
      }

      // A failed file doesn't discard the rest of the batch: keep every
      // produced result and report the failures alongside them.
      sink.settle(results);
      this.error.set(summarizeFailures(failures, files.length));
    } finally {
      // Only clear progress for the active run; a newer run/reset owns it now.
      if (runId === this.runId) {
        this.isProcessing.set(false);
        this.job.set(null);
        this.barLatched.set(false);
      }
    }
  }

  /** Rename a produced output (does not invalidate the render). */
  renameOutput(index: number, fileName: string): void {
    this.outputs.update((outputs) =>
      outputs.map((output, i) => (i === index ? { ...output, fileName } : output)),
    );
  }

  /** Reorder produced outputs, e.g. before zipping (does not invalidate them). */
  moveOutput(from: number, to: number): void {
    this.outputs.update((outputs) => {
      if (from < 0 || from >= outputs.length || to < 0 || to >= outputs.length || from === to) {
        return outputs;
      }
      const next = [...outputs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  reset(): void {
    this.runId++; // cancel any in-flight job
    this.reuse.clear();
    this.replaceOutputs([]);
    this.replaceOcrResults([]);
    this.files.set([]);
    this.error.set('');
    this.job.set(null);
    this.isProcessing.set(false);
    this.barLatched.set(false);
    this.outputStale.set(false);
  }

  private replaceOutputs(outputs: ImageOutput[]): void {
    this.processing.revoke(this.outputs());
    this.outputs.set(outputs);
  }

  private replaceOcrResults(results: OcrResult[]): void {
    this.revokeOcrResults(this.ocrResults());
    this.ocrResults.set(results);
  }

  /** Release the object URLs backing OCR result previews. */
  private revokeOcrResults(results: readonly OcrResult[]): void {
    for (const result of results) {
      URL.revokeObjectURL(result.imageUrl);
    }
  }

  /**
   * Project the total runtime from progress so far. Once that projection passes
   * the threshold we latch the bar on for the rest of the job.
   */
  private evaluateBar(): void {
    const job = this.job();
    if (!job || this.barLatched()) {
      return;
    }

    const elapsed = Date.now() - this.startedAt;
    const projectedTotal = job.completed > 0 ? (elapsed / job.completed) * job.total : elapsed;

    if (projectedTotal > BAR_THRESHOLD_MS) {
      this.barLatched.set(true);
    }
  }
}

/** Compact, user-facing summary of which files in a batch failed and why. */
function summarizeFailures(
  failures: readonly { fileName: string; message: string }[],
  total: number,
): string {
  if (failures.length === 0) {
    return '';
  }
  if (total === 1) {
    return failures[0].message;
  }

  const names = failures
    .slice(0, 3)
    .map((failure) => failure.fileName)
    .join(', ');
  const more = failures.length > 3 ? ` and ${failures.length - 3} more` : '';
  return `${failures.length} of ${total} images failed (${names}${more}): ${failures[0].message}`;
}
