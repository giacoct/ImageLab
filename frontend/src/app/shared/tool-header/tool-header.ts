import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ImageToolDefinition } from '../../tool-registry';
import { Icon } from '../icon/icon';
import { StepIndicator, WorkflowStep } from '../step-indicator/step-indicator';

/** Top of every workflow page: the step indicator, then the tool's icon, title, and description. */
@Component({
  selector: 'app-tool-header',
  imports: [Icon, StepIndicator],
  templateUrl: './tool-header.html',
  styleUrl: './tool-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolHeader {
  readonly tool = input.required<ImageToolDefinition>();
  /** The workflow step this page is. */
  readonly step = input.required<WorkflowStep>();
}
