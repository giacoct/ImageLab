import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  resource,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, map } from 'rxjs';

import { renameFile } from '../../domain/image-files';
import { keyBackgroundPixels } from '../../domain/pixel-ops';
import { context2d, loadPreviewImageData } from '../../services/canvas';
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
  protected readonly form = this.fb.group({
    color: ['#ffffff', [Validators.required]],
    tolerance: [18, [Validators.required, Validators.min(1), Validators.max(100)]],
    edgeSmoothing: [8, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');
  /** A downscaled snapshot of the selected file, keyed live in the preview. */
  private readonly source = resource({
    params: () => this.selectedFile(),
    loader: ({ params: file }) => loadPreviewImageData(file, PREVIEW_MAX_SIDE),
  });
  protected readonly previewReady = computed(() => this.source.hasValue());

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

    // Re-key whenever the snapshot, the parameters, or the canvas change.
    effect(() => {
      const key = this.keyParams();
      const canvas = this.canvasRef()?.nativeElement;
      if (!this.source.hasValue() || !canvas) {
        return;
      }

      const source = this.source.value();
      const keyed = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
      keyBackgroundPixels(keyed.data, key);
      canvas.width = keyed.width;
      canvas.height = keyed.height;
      context2d(canvas).putImageData(keyed, 0, 0);
    });
  }

  protected override createProcessor(): JobProcessor {
    const key = this.form.getRawValue();

    return (file) =>
      this.processing.renderBackgroundRemoved(file, {
        ...key,
        fileName: renameFile(file.name, 'transparent', 'image/png'),
      });
  }
}
