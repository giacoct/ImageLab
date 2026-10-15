import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolCard } from '../../shared/tool-card/tool-card';
import { TOOLS } from '../../tool-registry';

/** Dashboard: a card per tool, linking to its import step. */
@Component({
  selector: 'app-home',
  imports: [RouterLink, ToolCard],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly tools = TOOLS;
}
