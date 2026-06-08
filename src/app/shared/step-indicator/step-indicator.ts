import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

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
  state: 'done' | 'current' | 'upcoming';
  link: string;
}

@Component({
  selector: 'app-step-indicator',
  imports: [RouterLink],
  templateUrl: './step-indicator.html',
  styleUrl: './step-indicator.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepIndicator {
  /** The stage the user is currently on. */
  readonly current = input.required<WorkflowStep>();
  /** Base route for the active tool, e.g. `/tools/resize`. */
  readonly toolRoute = input.required<string>();

  protected readonly steps = computed<StepView[]>(() => {
    const currentIndex = ORDER.indexOf(this.current());
    const base = this.toolRoute().replace(/\/$/, '');

    return ORDER.map((id, i) => ({
      id,
      index: i + 1,
      label: LABELS[id],
      state: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming',
      link: `${base}/${id}`,
    }));
  });
}
