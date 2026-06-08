import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { NotificationsComponent } from './shared/notifications/notifications.component';
import { ToolRegistryService } from './core/services/tool-registry.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NotificationsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly registry = inject(ToolRegistryService);
  protected readonly tools = this.registry.tools;
}
