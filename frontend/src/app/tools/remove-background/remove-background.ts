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

import { renameFile } from '../../domain/image-files';
import { keyBackgroundPixels } from '../../domain/pixel-ops';
import { loadPreviewImageData } from '../../services/canvas';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/** Longest side of the downscaled preview, in pixels. */
const PREVIEW_MAX_SIDE = 480;

/** Remove background: keys out a chosen color to transparency (always exports PNG). */
@Component({
  selector: 'app-remove-background-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './remove-background.html',
  styleUrl: './remove-background.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveBackground extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'remove-background';
  protected override readonly errorMessage = 'The background could not be removed.';
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

    this.registerForm(this.form);

    // Decode a downscaled snapshot of the selected file for live keying.
    effect((onCleanup) => {
      const file = this.selectedFile();
      this.source.set(null);
      if (!file) {
        return;
      }
      let current = true;
      onCleanup(() => (current = false));
      void loadPreviewImageData(file, PREVIEW_MAX_SIDE).then((data) => {
        if (current) this.source.set(data);
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
      keyBackgroundPixels(keyed.data, {
        color: params.keyColor,
        tolerance: params.tolerance,
        edgeSmoothing: params.edgeSmoothing,
      });

      canvas.width = keyed.width;
      canvas.height = keyed.height;
      canvas.getContext('2d')?.putImageData(keyed, 0, 0);
    });
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
