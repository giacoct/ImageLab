import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolRegistryService } from '../../core/services/tool-registry.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="tool-grid" aria-label="Available tools">
      @for (tool of tools; track tool.id) {
        <a class="tool-card" [routerLink]="tool.route">
          <span class="tool-badge" [class.batch]="tool.batch" [class.single]="!tool.batch">
            {{ tool.batch ? 'Batch' : 'Single' }}
          </span>
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
