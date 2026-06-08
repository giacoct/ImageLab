import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { Icon } from '../icon/icon';

@Component({
  selector: 'app-file-dropzone',
  imports: [Icon],
  templateUrl: './file-dropzone.html',
  styleUrl: './file-dropzone.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileDropzone {
  readonly acceptedTypes = input<readonly string[]>(['image/jpeg', 'image/png', 'image/webp']);
  readonly multiple = input(true);
  readonly filesSelected = output<File[]>();

  protected readonly isDragging = signal(false);
  protected readonly acceptAttribute = computed(() => this.acceptedTypes().join(','));
  protected readonly acceptedLabel = computed(() =>
    this.acceptedTypes()
      .map((type) => type.replace('image/', '').toUpperCase())
      .join(', '),
  );

  protected handleInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.emitFiles(inputElement.files);
    inputElement.value = '';
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

    const accepted = new Set(this.acceptedTypes());
    const files = Array.from(fileList).filter((file) => accepted.has(file.type));
    this.filesSelected.emit(this.multiple() ? files : files.slice(0, 1));
  }
}
