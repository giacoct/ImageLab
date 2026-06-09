import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { ToolSessionService } from '../../core/services/tool-session.service';
import { Icon } from '../../shared/icon/icon';
import { OutputList } from '../../shared/output-list/output-list';
import { ProgressBar } from '../../shared/progress-bar/progress-bar';
import { StepIndicator } from '../../shared/step-indicator/step-indicator';

/**
 * Generic final step: shows a progress bar while a slow job runs, then the
 * produced images with download / chain-to-another-tool controls.
 */
@Component({
  selector: 'app-output-page',
  imports: [RouterLink, Icon, StepIndicator, ProgressBar, OutputList],
  templateUrl: './output-page.html',
  styleUrl: '../tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutputPage implements OnInit {
  /** Bound from the route's `data.toolId`. */
  readonly toolId = input.required<string>();

  private readonly registry = inject(ToolRegistryService);
  private readonly session = inject(ToolSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tool = computed(() => this.registry.findById(this.toolId())!);
  protected readonly outputs = this.session.outputs;
  protected readonly isProcessing = this.session.isProcessing;
  protected readonly showProgressBar = this.session.showProgressBar;
  protected readonly percent = this.session.percent;
  protected readonly error = this.session.error;
  protected readonly currentFileName = computed(() => this.session.job()?.currentFileName ?? '');

  ngOnInit(): void {
    // Reached with nothing to show (e.g. a deep link) — send the user back.
    if (!this.isProcessing() && this.outputs().length === 0 && !this.error()) {
      const target = this.session.files().length > 0 ? '../settings' : '../import';
      void this.router.navigate([target], { relativeTo: this.route });
    }
  }
}
