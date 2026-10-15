import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ImageToolDefinition } from '../../tool-registry';
import { Icon } from '../icon/icon';

/**
 * The content of a tool card (icon, Batch/Single badge, title, description),
 * shared by the home dashboard and the chain-to-another-tool picker. The
 * parent wraps it in the clickable element (a link or a button).
 */
@Component({
  selector: 'app-tool-card',
  imports: [Icon],
  templateUrl: './tool-card.html',
  styleUrl: './tool-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolCard {
  readonly tool = input.required<ImageToolDefinition>();
}
