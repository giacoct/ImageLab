import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolRegistryService } from '../../core/services/tool-registry.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="home-hero">
      <div class="hero-instruction" role="note">
        <svg
          class="hero-instruction__icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p class="hero-copy">
          Choose a tool, upload one or more images, adjust the settings, and download the processed
          files.
        </p>
      </div>
    </section>

    <section class="tool-grid" aria-label="Available tools">
      @for (tool of tools; track tool.id) {
        <a class="tool-card" [routerLink]="tool.route">
          <span class="tool-badge">{{ tool.batch ? 'Batch' : 'Single' }}</span>
          <h2>{{ tool.title }}</h2>
          <p>{{ tool.description }}</p>
        </a>
      }
    </section>
  `,
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly registry = inject(ToolRegistryService);
  protected readonly tools = this.registry.tools;
}
