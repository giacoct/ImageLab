import { Injectable, signal } from '@angular/core';

export interface JobProgress {
  total: number;
  completed: number;
  startedAt: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  /** Active processing job, or null when idle. */
  readonly job = signal<JobProgress | null>(null);
  /** Transient "ready" message shown in the corner toast. */
  readonly toast = signal<string | null>(null);

  private toastTimer?: ReturnType<typeof setTimeout>;

  startJob(total: number): void {
    this.job.set({ total, completed: 0, startedAt: Date.now() });
  }

  advanceJob(completed: number): void {
    this.job.update((job) => (job ? { ...job, completed } : job));
  }

  finishJob(total: number): void {
    this.job.set(null);
    this.notify(`${total} image${total === 1 ? '' : 's'} ready to download`);
  }

  cancelJob(): void {
    this.job.set(null);
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
}
