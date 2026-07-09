import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { OcrResult } from '../../core/models/ocr-result.model';
import { DownloadService, ZipEntry, createZip } from '../../core/services/download.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { ToolSessionService } from '../../core/services/tool-session.service';
import { Icon } from '../../shared/icon/icon';
import { ProgressBar } from '../../shared/progress-bar/progress-bar';
import { StepIndicator } from '../../shared/step-indicator/step-indicator';
import { OcrImage } from './ocr-image';

/**
 * Output step for the OCR tool: each image is shown with a selectable text
 * layer ({@link OcrImage}), alongside controls to copy or download the
 * recognized text. Mirrors the generic output page's header and progress, but
 * the result is text rather than downloadable images.
 */
@Component({
  selector: 'app-ocr-output',
  imports: [RouterLink, Icon, StepIndicator, ProgressBar, OcrImage],
  templateUrl: './ocr-output.html',
  styleUrls: ['../../pages/tool-page.css', './ocr-output.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OcrOutput implements OnInit {
  /** Bound from the route's `data.toolId`. */
  readonly toolId = input.required<string>();

  private readonly registry = inject(ToolRegistryService);
  private readonly session = inject(ToolSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly downloads = inject(DownloadService);

  protected readonly tool = computed(() => this.registry.findById(this.toolId())!);
  protected readonly results = this.session.ocrResults;
  protected readonly isProcessing = this.session.isProcessing;
  protected readonly showProgressBar = this.session.showProgressBar;
  protected readonly percent = this.session.percent;
  protected readonly error = this.session.error;
  protected readonly currentFileName = computed(() => this.session.job()?.currentFileName ?? '');
  protected readonly isBatch = computed(() => this.results().length > 1);

  /** Index of the card whose text was just copied (for transient feedback). */
  protected readonly copiedIndex = signal<number | null>(null);
  private copyTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    // Reached with nothing to show (e.g. a deep link) — send the user back.
    if (!this.isProcessing() && this.results().length === 0 && !this.error()) {
      const target = this.session.files().length > 0 ? '../settings' : '../import';
      void this.router.navigate([target], { relativeTo: this.route });
    }
  }

  /** Clear this session and return to the same tool's import step for a new job. */
  protected startAgain(): void {
    this.session.reset();
    void this.router.navigateByUrl(`${this.tool().route}/import`);
  }

  protected async copy(result: OcrResult, index: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(result.text);
      this.copiedIndex.set(index);
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedIndex.set(null), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the download stays available.
    }
  }

  protected downloadText(result: OcrResult): void {
    this.downloads.downloadText(result.text, toTextName(result.fileName));
  }

  protected async downloadAll(): Promise<void> {
    const blob = await createZip(textEntries(this.results()));
    this.downloads.downloadBlob(blob, `imagelab-ocr-${this.results().length}-texts.zip`);
  }

  protected charCount(result: OcrResult): number {
    return result.text.length;
  }
}

/** Swap any extension for `.txt`. */
function toTextName(fileName: string): string {
  return `${fileName.replace(/\.[^/.]+$/, '')}.txt`;
}

/** Build unique-named `.txt` ZIP entries from the recognized texts. */
function textEntries(results: readonly OcrResult[]): ZipEntry[] {
  const seen = new Map<string, number>();
  return results.map((result) => {
    let name = toTextName(result.fileName);
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) {
      name = name.replace(/\.txt$/, `-${count + 1}.txt`);
    }
    return { name, blob: new Blob([result.text], { type: 'text/plain;charset=utf-8' }) };
  });
}
