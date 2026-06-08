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
  templateUrl: './progress-ring.html',
  styleUrl: './progress-ring.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressRing {
  private readonly notifications = inject(NotificationService);

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;
  protected readonly active = this.notifications.showRing;
  protected readonly percent = this.notifications.percent;
  protected readonly dashOffset = computed(() => CIRCUMFERENCE * (1 - this.percent() / 100));
}
