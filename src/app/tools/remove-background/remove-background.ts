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

import { applyBackgroundKey } from '../../core/services/image-processing.service';
import { JobProcessor } from '../../core/services/tool-session.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';
import { renameFile } from '../../core/utils/image-tool-utils';

/** Longest side of the downscaled preview, in pixels. */
const PREVIEW_MAX_SIDE = 480;

@Component({
  selector: 'app-remove-background-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './remove-background.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveBackground extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'remove-background';
  protected readonly form = this.fb.group({
    keyColor: ['#ffffff', [Validators.required]],
    tolerance: [18, [Validators.required, Validators.min(1), Validators.max(100)]],
    edgeSmoothing: [8, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');
  private readonly source = signal<ImageData | null>(null);
  private loadToken = 0;
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

    this.registerForm(this.form);

    // Decode a downscaled snapshot of the selected file for live keying.
    effect(() => {
      const file = this.selectedFile();
      const token = ++this.loadToken;
      if (!file) {
        this.source.set(null);
        return;
      }
      void loadPreviewData(file).then((data) => {
        if (token === this.loadToken) {
          this.source.set(data);
        }
      });
    });

    // Re-key whenever the snapshot, the parameters, or the canvas change.
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

  protected override createProcessor(): JobProcessor {
    const value = this.form.getRawValue();

    return (file) =>
      this.processing.renderBackgroundRemoved(file, {
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
