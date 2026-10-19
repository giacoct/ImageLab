import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { withExtension } from '../../domain/image-files';
import { OcrResult } from '../../domain/ocr-result.model';
import { DownloadService } from '../../services/download.service';
import { Icon } from '../icon/icon';
import { OcrImage } from '../ocr-image/ocr-image';

/**
 * The OCR tool's results on the output page: each image with its selectable
 * text layer ({@link OcrImage}), plus copy / download-as-.txt controls.
 */
@Component({
  selector: 'app-ocr-results',
  imports: [Icon, OcrImage],
  templateUrl: './ocr-results.html',
  styleUrl: './ocr-results.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OcrResults {
  private readonly downloads = inject(DownloadService);

  readonly results = input.required<readonly OcrResult[]>();

  protected readonly isBatch = computed(() => this.results().length > 1);

  /** Index of the card whose text was just copied (for transient feedback). */
  protected readonly copiedIndex = signal<number | null>(null);
  private copyTimer?: ReturnType<typeof setTimeout>;

  protected async copy(result: OcrResult, index: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(result.text);
      this.copiedIndex.set(index);
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedIndex.set(null), 1500);
    } catch {
      // Clipboard blocked (e.g. a plain-http LAN address) — the download stays available.
    }
  }

  protected downloadText(result: OcrResult): void {
    this.downloads.downloadText(result.text, withExtension(result.fileName, 'txt'));
  }

  protected downloadAll(): void {
    const entries = this.results().map((result) => ({
      name: withExtension(result.fileName, 'txt'),
      blob: new Blob([result.text], { type: 'text/plain;charset=utf-8' }),
    }));
    void this.downloads.downloadZip(entries, `imagelab-ocr-${entries.length}-texts.zip`);
  }
}
