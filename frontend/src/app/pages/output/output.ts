import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ToolSessionService } from '../../services/tool-session.service';
import { Icon } from '../../shared/icon/icon';
import { OcrResults } from '../../shared/ocr-results/ocr-results';
import { OutputList } from '../../shared/output-list/output-list';
import { ProgressBar } from '../../shared/progress-bar/progress-bar';
import { ToolHeader } from '../../shared/tool-header/tool-header';
import { findTool } from '../../tool-registry';

/**
 * Step 3 of every tool: a progress bar while a slow job runs, then the
 * results — image cards (download / rename / chain) or, for the OCR tool, the
 * recognized text over each image.
 */
@Component({
  selector: 'app-output-page',
  imports: [RouterLink, Icon, ToolHeader, ProgressBar, OutputList, OcrResults],
  templateUrl: './output.html',
  styleUrl: './output.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutputPage implements OnInit {
  /** Bound from the route's `data.toolId`. */
  readonly toolId = input.required<string>();

  private readonly session = inject(ToolSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tool = computed(() => findTool(this.toolId()));
  protected readonly outputs = this.session.outputs;
  protected readonly ocrResults = this.session.ocrResults;
  protected readonly isProcessing = this.session.isProcessing;
  protected readonly showProgressBar = this.session.showProgressBar;
  protected readonly percent = this.session.percent;
  protected readonly error = this.session.error;
  protected readonly currentFileName = computed(() => this.session.job()?.currentFileName ?? '');

  ngOnInit(): void {
    // Reached with nothing to show (e.g. a deep link) — send the user back.
    const nothingToShow = this.outputs().length === 0 && this.ocrResults().length === 0;
    if (!this.isProcessing() && nothingToShow && !this.error()) {
      const target = this.session.files().length > 0 ? '../settings' : '../import';
      void this.router.navigate([target], { relativeTo: this.route });
    }
  }

  /** Clear this session and return to the same tool's import step for a new job. */
  protected startAgain(): void {
    this.session.reset();
    void this.router.navigateByUrl(`${this.tool().route}/import`);
  }
}
