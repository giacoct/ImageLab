import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolRegistryService } from '../../core/services/tool-registry.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="home-hero">
      <div>
        <p class="eyebrow">Browser-based image tools</p>
        <h1>Prepare images without sending them anywhere.</h1>
      </div>
      <p class="hero-copy">
        Choose a tool, upload one or more images, adjust the settings, and download the processed
        files.
      </p>
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
