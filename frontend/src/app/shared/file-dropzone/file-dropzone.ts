import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { isHeic } from '../../domain/image-files';
import { ACCEPTED_TYPES } from '../../tool-registry';
import { Icon } from '../icon/icon';

/**
 * Drop zone + file picker for images; emits only files of an accepted type,
 * plus HEIC/HEIF photos (the import page converts those).
 */
@Component({
  selector: 'app-file-dropzone',
  imports: [Icon],
  templateUrl: './file-dropzone.html',
  styleUrl: './file-dropzone.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileDropzone {
  /** Allow picking several files at once (batch tools). */
  readonly multiple = input(true);
  readonly filesSelected = output<File[]>();

  protected readonly isDragging = signal(false);
  protected readonly acceptAttribute = [
    ...ACCEPTED_TYPES,
    'image/heic',
    'image/heif',
    '.heic',
    '.heif',
  ].join(',');
  protected readonly acceptedLabel = 'JPEG, PNG, WEBP, HEIC';

  protected handleInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.emitFiles(inputElement.files);
    inputElement.value = ''; // so picking the same file again still fires `change`
  }

  protected handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  protected handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    this.emitFiles(event.dataTransfer?.files ?? null);
  }

  private emitFiles(fileList: FileList | null): void {
    if (!fileList) {
      return;
    }
    const files = Array.from(fileList).filter(
      (file) => ACCEPTED_TYPES.includes(file.type) || isHeic(file),
    );
    this.filesSelected.emit(this.multiple() ? files : files.slice(0, 1));
  }
}
