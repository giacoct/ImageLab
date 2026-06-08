import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notifications {
  private readonly notifications = inject(NotificationService);

  protected readonly toast = this.notifications.toast;

  protected dismiss(): void {
    this.notifications.dismissToast();
  }
}
