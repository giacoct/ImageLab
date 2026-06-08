import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolSessionService } from '../../core/services/tool-session.service';
import { Icon } from '../icon/icon';

export type WorkflowStep = 'import' | 'settings' | 'output';

const ORDER: readonly WorkflowStep[] = ['import', 'settings', 'output'];
const LABELS: Record<WorkflowStep, string> = {
  import: 'Import',
  settings: 'Settings',
  output: 'Output',
};

interface StepView {
  id: WorkflowStep;
  index: number;
  label: string;
  isCurrent: boolean;
  /** A reachable step that comes before the current one. */
  done: boolean;
  enabled: boolean;
  link: string;
}

@Component({
  selector: 'app-step-indicator',
  imports: [RouterLink, Icon],
  templateUrl: './step-indicator.html',
  styleUrl: './step-indicator.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepIndicator {
  /** The stage the user is currently on. */
  readonly current = input.required<WorkflowStep>();
  /** Base route for the active tool, e.g. `/tools/resize`. */
  readonly toolRoute = input.required<string>();

  private readonly session = inject(ToolSessionService);

  protected readonly steps = computed<StepView[]>(() => {
    const current = this.current();
    const currentIndex = ORDER.indexOf(current);
    const base = this.toolRoute().replace(/\/$/, '');
    const enabled: Record<WorkflowStep, boolean> = {
      import: true,
      settings: this.session.canVisitSettings(),
      output: this.session.canVisitOutput(),
    };

    return ORDER.map((id, i) => ({
      id,
      index: i + 1,
      label: LABELS[id],
      isCurrent: id === current,
      done: i < currentIndex && enabled[id],
      enabled: enabled[id],
      link: `${base}/${id}`,
    }));
  });
}
