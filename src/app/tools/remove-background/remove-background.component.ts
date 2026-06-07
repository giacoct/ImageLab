import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, map } from 'rxjs';

import { ImageOutput } from '../../core/models/image-output.model';
import { applyBackgroundKey } from '../../core/services/image-processing.service';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { renameFile } from '../shared/image-tool-utils';

/** Longest side of the downscaled preview, in pixels. */
const PREVIEW_MAX_SIDE = 480;

@Component({
  selector: 'app-remove-background-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Remove background"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      @if (previewReady()) {
        <section preview class="tool-preview panel" aria-label="Live preview">
          <h2>Preview</h2>
          <div class="preview-stage is-transparent">
            <canvas #previewCanvas></canvas>
          </div>
          <span class="preview-hint">Preview is downscaled; export keys at full resolution.</span>
        </section>
      }

      <div class="tool-fields" [formGroup]="form">
        <div class="field">
          <label for="keyColor">Key color</label>
          <input id="keyColor" type="color" formControlName="keyColor" />
        </div>

        <div class="field">
          <label for="tolerance">Tolerance: {{ form.controls.tolerance.value }}%</label>
          <input
            id="tolerance"
            type="range"
            min="1"
            max="100"
            step="1"
            formControlName="tolerance"
          />
        </div>

        <div class="field">
          <label for="edgeSmoothing"
            >Edge smoothing: {{ form.controls.edgeSmoothing.value }}%</label
          >
          <input
            id="edgeSmoothing"
            type="range"
            min="0"
            max="100"
            step="1"
            formControlName="edgeSmoothing"
          />
        </div>
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveBackgroundComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'remove-background';
  protected readonly form = this.fb.group({
    keyColor: ['#ffffff', [Validators.required]],
    tolerance: [18, [Validators.required, Validators.min(1), Validators.max(100)]],
    edgeSmoothing: [8, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');
  private readonly source = signal<ImageData | null>(null);
  protected readonly previewReady = computed(() => this.source() !== null);

  private readonly keyParams = toSignal(
    this.form.valueChanges.pipe(
      debounceTime(120),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  constructor() {
    super();

    effect(() => {
      const data = this.source();
      const params = this.keyParams();
      const canvas = this.canvasRef()?.nativeElement;
      if (!data || !canvas) {
        return;
      }

      const keyed = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
      applyBackgroundKey(keyed, {
        color: params.keyColor,
        tolerance: params.tolerance,
        edgeSmoothing: params.edgeSmoothing,
      });

      canvas.width = keyed.width;
      canvas.height = keyed.height;
      canvas.getContext('2d')?.putImageData(keyed, 0, 0);
    });
  }

  protected override get errorMessage(): string {
    return 'The background could not be removed.';
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override async onFilesSelected(files: File[]): Promise<void> {
    this.source.set(files[0] ? await loadPreviewData(files[0]) : null);
  }

  protected override processFile(file: File): Promise<ImageOutput> {
    const value = this.form.getRawValue();

    return this.processing.renderBackgroundRemoved(file, {
      color: value.keyColor,
      tolerance: value.tolerance,
      edgeSmoothing: value.edgeSmoothing,
      fileName: renameFile(file.name, 'transparent', 'image/png'),
    });
  }
}

/** Decode a file and return a downscaled ImageData snapshot for live keying. */
async function loadPreviewData(file: File): Promise<ImageData | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    bitmap.close();
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return context.getImageData(0, 0, width, height);
}
