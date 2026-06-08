import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly registry = inject(ToolRegistryService);
  protected readonly tools = this.registry.tools;
}
