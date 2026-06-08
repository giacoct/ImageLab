import { Injectable, computed, inject, signal } from '@angular/core';

import { ImageOutput } from '../models/image-output.model';
import { ImageProcessingService } from './image-processing.service';
import { WorkflowReuseStrategy } from './workflow-reuse.strategy';

/** Produces one output for a single input file. Snapshots its settings up front. */
export type JobProcessor = (file: File) => Promise<ImageOutput>;

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

  /** Whether the current outputs still reflect the current settings + files. */
  readonly outputsFresh = computed(() => this.outputs().length > 0 && !this.outputStale());

  /** Step pages the user is allowed to jump to (import is always reachable). */
  readonly canVisitSettings = computed(() => this.files().length > 0);
  readonly canVisitOutput = this.outputsFresh;

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
    this.error.set('');
    this.files.set(files);
  }

  /** Mark the produced outputs out of date (settings changed since the run). */
  markStale(): void {
    this.outputStale.set(true);
  }

  /** Run a processor over every selected file, collecting the outputs. */
  async run(
    processor: JobProcessor,
    fallbackMessage = 'The images could not be processed.',
  ): Promise<void> {
    const files = this.files();
    if (files.length === 0 || this.isProcessing()) {
      return;
    }

    const runId = ++this.runId;
    this.isProcessing.set(true);
    this.error.set('');
    this.replaceOutputs([]);
    this.barLatched.set(false);
    this.startedAt = Date.now();
    this.job.set({ total: files.length, completed: 0, currentFileName: files[0].name });

    const nextOutputs: ImageOutput[] = [];

    try {
      for (const file of files) {
        this.job.update((job) => (job ? { ...job, currentFileName: file.name } : job));
        const output = await processor(file);

        // Abandoned mid-flight (the session was reset or restarted).
        if (runId !== this.runId) {
          this.processing.revoke([...nextOutputs, output]);
          return;
        }

        nextOutputs.push(output);
        this.job.update((job) => (job ? { ...job, completed: nextOutputs.length } : job));
        this.evaluateBar();
      }

      this.outputs.set(nextOutputs);
      this.outputStale.set(false);
    } catch (error) {
      if (runId !== this.runId) {
        this.processing.revoke(nextOutputs);
        return;
      }
      this.error.set(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      // Only clear progress for the active run; a newer run/reset owns it now.
      if (runId === this.runId) {
        this.isProcessing.set(false);
        this.job.set(null);
        this.barLatched.set(false);
      }
    }
  }

  reset(): void {
    this.runId++; // cancel any in-flight job
    this.reuse.clear();
    this.replaceOutputs([]);
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
