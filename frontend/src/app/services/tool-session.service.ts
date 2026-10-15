import { Injectable, computed, inject, signal } from '@angular/core';

import { ImageOutput } from '../domain/image-output.model';
import { OcrResult } from '../domain/ocr-result.model';
import { ImageProcessingService } from './image-processing.service';
import { WorkflowReuseStrategy } from './workflow-reuse.strategy';

/** Produces one output for a single input file. Snapshots its settings up front. */
export type JobProcessor = (file: File) => Promise<ImageOutput>;

/** Produces recognized text + boxes for a single input file (the OCR tool). */
export type OcrProcessor = (file: File) => Promise<OcrResult>;

/** One unit of work in a batch: usually one file, or all files for a combined job. */
interface BatchTask<T> {
  /** File name shown in the progress bar and in failure messages. */
  name: string;
  run(): Promise<T>;
}

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
    this.discardResults();
    this.files.set(files);
  }

  /**
   * Append files to the current selection (dropzone and clipboard paste add
   * to, rather than replace, the existing list). Duplicates are kept.
   */
  addFiles(incoming: File[]): void {
    if (incoming.length === 0) {
      return;
    }
    this.discardResults();
    this.files.update((current) => [...current, ...incoming]);
  }

  /** Remove a single selected file (the per-item ✕ on the import step). */
  removeFile(index: number): void {
    this.discardResults();
    this.files.update((files) => files.filter((_, i) => i !== index));
  }

  /** Drop any produced results and clear the error before the file set changes. */
  private discardResults(): void {
    this.replaceOutputs([]);
    this.replaceOcrResults([]);
    this.error.set('');
  }

  /** Reorder the selected files (drag-reorder in the file lists). */
  moveFile(from: number, to: number): void {
    const next = moveItem(this.files(), from, to);
    if (next) {
      this.files.set(next);
      // The produced results no longer match the new order; re-run on next visit.
      this.markStale();
    }
  }

  /** Mark the produced outputs out of date (settings changed since the run). */
  markStale(): void {
    this.outputStale.set(true);
  }

  /** Run an image processor over every selected file, collecting the outputs. */
  run(processor: JobProcessor, fallbackMessage: string): Promise<void> {
    const tasks = this.files().map((file) => ({ name: file.name, run: () => processor(file) }));
    return this.runTasks(tasks, fallbackMessage, this.imageSink);
  }

  /**
   * Run a processor that combines *all* selected files into a single image
   * output (e.g. the merge tool), as opposed to one output per file.
   */
  runCombined(
    process: (files: File[]) => Promise<ImageOutput>,
    fallbackMessage: string,
  ): Promise<void> {
    const files = this.files();
    if (files.length === 0) {
      return Promise.resolve();
    }
    const task = { name: files[0].name, run: () => process(files) };
    return this.runTasks([task], fallbackMessage, this.imageSink);
  }

  /** Run the OCR processor over every selected file, collecting the text results. */
  runOcr(processor: OcrProcessor, fallbackMessage: string): Promise<void> {
    const tasks = this.files().map((file) => ({ name: file.name, run: () => processor(file) }));
    return this.runTasks(tasks, fallbackMessage, {
      reset: () => this.replaceOcrResults([]),
      settle: (results) => {
        this.ocrResults.set(results);
        this.outputStale.set(false);
      },
      abandon: (results) => this.revokeOcrResults(results),
    });
  }

  /** Where image results go (shared by {@link run} and {@link runCombined}). */
  private readonly imageSink: BatchSink<ImageOutput> = {
    reset: () => this.replaceOutputs([]),
    settle: (results) => {
      this.outputs.set(results);
      this.outputStale.set(false);
    },
    abandon: (results) => this.processing.revoke(results),
  };

  /**
   * Shared batch loop: runs every task in order with progress, mid-flight
   * cancellation, and per-task failure collection. A {@link BatchSink} adapts
   * it to whichever result type the tool produces (image outputs or OCR text).
   */
  private async runTasks<T>(
    tasks: readonly BatchTask<T>[],
    fallbackMessage: string,
    sink: BatchSink<T>,
  ): Promise<void> {
    if (tasks.length === 0 || this.isProcessing()) {
      return;
    }

    const runId = ++this.runId;
    this.isProcessing.set(true);
    this.error.set('');
    sink.reset();
    this.barLatched.set(false);
    this.startedAt = Date.now();
    this.job.set({ total: tasks.length, completed: 0, currentFileName: tasks[0].name });

    const results: T[] = [];
    const failures: { fileName: string; message: string }[] = [];

    try {
      for (const [index, task] of tasks.entries()) {
        this.job.update((job) => (job ? { ...job, currentFileName: task.name } : job));

        let result: T | null = null;
        try {
          result = await task.run();
        } catch (error) {
          failures.push({
            fileName: task.name,
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
        this.job.update((job) => (job ? { ...job, completed: index + 1 } : job));
        this.evaluateBar();
      }

      // A failed file doesn't discard the rest of the batch: keep every
      // produced result and report the failures alongside them.
      sink.settle(results);
      this.error.set(summarizeFailures(failures, tasks.length));
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
    const next = moveItem(this.outputs(), from, to);
    if (next) {
      this.outputs.set(next);
    }
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

/** A copy of `items` with the item at `from` moved to `to`, or `null` when that's a no-op. */
function moveItem<T>(items: readonly T[], from: number, to: number): T[] | null {
  const inRange = (i: number) => i >= 0 && i < items.length;
  if (!inRange(from) || !inRange(to) || from === to) {
    return null;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
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
