import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { NotificationService } from '../../core/services/notification.service';

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Inline content for an action button: shows a progress ring + percentage while
 * a slow job runs, and projects its content (the button label) otherwise.
 */
@Component({
  selector: 'app-progress-ring',
  template: `
    @if (active()) {
      <svg class="btn-ring" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle class="btn-ring-track" cx="10" cy="10" [attr.r]="radius" />
        <circle
          class="btn-ring-value"
          cx="10"
          cy="10"
          [attr.r]="radius"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="dashOffset()"
        />
      </svg>
      <span class="btn-ring-pct">{{ percent() }}%</span>
    } @else {
      <ng-content />
    }
  `,
  styleUrl: './progress-ring.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressRingComponent {
  private readonly notifications = inject(NotificationService);

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;
  protected readonly active = this.notifications.showRing;
  protected readonly percent = this.notifications.percent;
  protected readonly dashOffset = computed(() => CIRCUMFERENCE * (1 - this.percent() / 100));
}
