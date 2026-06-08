import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-notifications',
  template: `
    <div class="notif-stack" aria-live="polite">
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
export class NotificationsComponent {
  private readonly notifications = inject(NotificationService);

  protected readonly toast = this.notifications.toast;

  protected dismiss(): void {
    this.notifications.dismissToast();
  }
}
