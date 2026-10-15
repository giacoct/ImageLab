import { Injectable } from '@angular/core';

import { ImageOutput } from '../domain/image-output.model';
import { ZipEntry, createZip, dedupeNames } from '../domain/zip';

/** Triggers browser downloads: single files, plain text, or a ZIP of many files. */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  download(output: ImageOutput): void {
    triggerDownload(output.url, output.fileName);
  }

  /** Download a UTF-8 text file. */
  downloadText(text: string, fileName: string): void {
    this.downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName);
  }

  /** Bundle every output into a single ZIP archive (duplicate names get numbered). */
  async downloadZip(outputs: readonly ImageOutput[], zipName: string): Promise<void> {
    await this.downloadEntriesAsZip(
      outputs.map((output) => ({ name: output.fileName, blob: output.blob })),
      zipName,
    );
  }

  async downloadEntriesAsZip(entries: readonly ZipEntry[], zipName: string): Promise<void> {
    this.downloadBlob(await createZip(dedupeNames(entries)), zipName);
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
    // Revoke later so the browser has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function triggerDownload(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
}
