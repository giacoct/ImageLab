import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-file-dropzone',
  template: `
    <section
      class="dropzone"
      [class.is-dragging]="isDragging()"
      (dragover)="handleDragOver($event)"
      (dragleave)="handleDragLeave($event)"
      (drop)="handleDrop($event)"
    >
      <label class="dropzone-label">
        <span class="dropzone-title">Choose images</span>
        <span class="dropzone-copy">Drop files here or browse from your device.</span>
        <span class="dropzone-meta">{{ acceptedLabel() }}</span>
        <input
          type="file"
          [attr.accept]="acceptAttribute()"
          [multiple]="multiple()"
          (change)="handleInput($event)"
        />
      </label>
    </section>
  `,
  styleUrl: './file-dropzone.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileDropzoneComponent {
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
