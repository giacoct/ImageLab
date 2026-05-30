import { Injectable } from '@angular/core';

import { ImageOutput } from '../models/image-output.model';

@Injectable({ providedIn: 'root' })
export class DownloadService {
  download(output: ImageOutput): void {
    const anchor = document.createElement('a');
    anchor.href = output.url;
    anchor.download = output.fileName;
    anchor.click();
  }

  downloadAll(outputs: readonly ImageOutput[]): void {
    for (const output of outputs) {
      this.download(output);
    }
  }
}
