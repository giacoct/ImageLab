import { Injectable, signal } from '@angular/core';

import { ImageOutput } from '../models/image-output.model';

interface PendingToolInput {
  targetToolId: string;
  files: File[];
}

@Injectable({ providedIn: 'root' })
export class ImagePipelineService {
  private readonly pendingInput = signal<PendingToolInput | null>(null);

  queue(targetToolId: string, outputs: readonly ImageOutput[]): void {
    this.pendingInput.set({
      targetToolId,
      files: outputs.map(
        (output) => new File([output.blob], output.fileName, { type: output.blob.type }),
      ),
    });
  }

  consume(targetToolId: string, acceptedTypes: readonly string[]): File[] {
    const pending = this.pendingInput();

    if (!pending || pending.targetToolId !== targetToolId) {
      return [];
    }

    this.pendingInput.set(null);
    const accepted = new Set(acceptedTypes);
    return pending.files.filter((file) => accepted.has(file.type));
  }
}
