import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ToolRegistryService } from './core/services/tool-registry.service';
import { ToolSessionService } from './core/services/tool-session.service';
import { Icon } from './shared/icon/icon';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgOptimizedImage, Icon],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly registry = inject(ToolRegistryService);
  private readonly session = inject(ToolSessionService);
  private readonly router = inject(Router);

  protected readonly tools = this.registry.tools;

  constructor() {
    // Leaving a tool's context (home, tool selection) discards its session so
    // re-entering a tool starts a fresh job rather than resuming the old one.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (!this.activeToolId()) {
          this.session.reset();
        }
      });
  }

  private activeToolId(): string | null {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const toolId = route.data['toolId'];
    return typeof toolId === 'string' ? toolId : null;
  }
}
