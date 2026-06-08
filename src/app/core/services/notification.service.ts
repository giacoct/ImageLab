import { Injectable, computed, signal } from '@angular/core';

export interface JobProgress {
  total: number;
  completed: number;
  startedAt: number;
}

/** A job must be estimated to run longer than this to reveal the progress ring. */
const RING_THRESHOLD_MS = 1000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  /** Active processing job, or null when idle. */
  readonly job = signal<JobProgress | null>(null);
  /** Transient "ready" message shown in the corner toast. */
  readonly toast = signal<string | null>(null);

  /** Latched once a job is judged slow, so the ring stays visible to 100%. */
  private readonly ringLatched = signal(false);
  private toastTimer?: ReturnType<typeof setTimeout>;

  /** Show the in-button ring only for jobs estimated to exceed the threshold. */
  readonly showRing = computed(() => this.job() !== null && this.ringLatched());

  readonly percent = computed(() => {
    const job = this.job();
    return job && job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  });

  startJob(total: number): void {
    this.ringLatched.set(false);
    this.job.set({ total, completed: 0, startedAt: Date.now() });
  }

  advanceJob(completed: number): void {
    this.job.update((job) => (job ? { ...job, completed } : job));
    this.evaluateRing();
  }

  finishJob(total: number): void {
    this.job.set(null);
    this.ringLatched.set(false);
    this.notify(`${total} image${total === 1 ? '' : 's'} ready to download`);
  }

  cancelJob(): void {
    this.job.set(null);
    this.ringLatched.set(false);
  }

  notify(message: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = setTimeout(() => this.toast.set(null), 5000);
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toast.set(null);
  }

  /**
   * Project the total runtime from progress so far. Once that projection passes
   * the threshold we latch the ring on for the rest of the job.
   */
  private evaluateRing(): void {
    const job = this.job();
    if (!job || this.ringLatched()) {
      return;
    }

    const elapsed = Date.now() - job.startedAt;
    const projectedTotal =
      job.completed > 0 ? (elapsed / job.completed) * job.total : elapsed;

    if (projectedTotal > RING_THRESHOLD_MS) {
      this.ringLatched.set(true);
    }
  }
}
