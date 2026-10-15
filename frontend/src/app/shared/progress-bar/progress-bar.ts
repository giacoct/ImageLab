import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Determinate progress bar shown on the output page while a slow job runs.
 * Surfaces the percentage and the name of the file currently being processed.
 */
@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressBar {
  readonly percent = input(0);
  readonly fileName = input('');

  protected readonly valueText = computed(() =>
    this.fileName() ? `${this.percent()}% — processing ${this.fileName()}` : `${this.percent()}%`,
  );
}
