import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';

import { NotificationService } from '../../core/services/notification.service';

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Only surface the spinner once a job is clearly slow (see `showProgress`). */
const MIN_ELAPSED_MS = 2000;
const MIN_REMAINING_MS = 2000;

@Component({
  selector: 'app-notifications',
  template: `
    <div class="notif-stack" aria-live="polite">
      @if (showProgress()) {
        <div class="notif progress" role="status">
          <svg class="ring" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
            <circle class="ring-track" cx="24" cy="24" [attr.r]="radius" />
            <circle
              class="ring-value"
              cx="24"
              cy="24"
              [attr.r]="radius"
              [attr.stroke-dasharray]="circumference"
              [attr.stroke-dashoffset]="dashOffset()"
            />
          </svg>
          <div class="progress-text">
            <strong>Processing… {{ percent() }}%</strong>
            <span>{{ job()?.completed }} of {{ job()?.total }} images</span>
          </div>
        </div>
      }

      @if (toast(); as message) {
        <div class="notif toast" role="status">
          <span class="toast-icon" aria-hidden="true">✓</span>
          <p>{{ message }}</p>
          <button class="toast-dismiss" type="button" aria-label="Dismiss" (click)="dismiss()">
            ×
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './notifications.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnDestroy {
  private readonly notifications = inject(NotificationService);

  protected readonly radius = RING_RADIUS;
  protected readonly circumference = RING_CIRCUMFERENCE;

  protected readonly job = this.notifications.job;
  protected readonly toast = this.notifications.toast;

  /** Ticks while a job is active so elapsed-time computeds stay live. */
  private readonly now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    // Drive the clock only while a job is running.
    this.startClock();
  }

  protected readonly percent = computed(() => {
    const job = this.job();
    return job && job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  });

  protected readonly dashOffset = computed(
    () => RING_CIRCUMFERENCE * (1 - this.percent() / 100),
  );

  protected readonly showProgress = computed(() => {
    const job = this.job();
    if (!job) {
      return false;
    }

    const elapsed = this.now() - job.startedAt;
    if (elapsed <= MIN_ELAPSED_MS) {
      return false;
    }

    const estimatedRemaining =
      job.completed > 0
        ? (elapsed / job.completed) * (job.total - job.completed)
        : Number.POSITIVE_INFINITY;

    return estimatedRemaining > MIN_REMAINING_MS;
  });

  protected dismiss(): void {
    this.notifications.dismissToast();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private startClock(): void {
    this.timer = setInterval(() => {
      if (this.job()) {
        this.now.set(Date.now());
      }
    }, 250);
  }
}
