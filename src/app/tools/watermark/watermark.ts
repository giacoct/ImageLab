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

import { WatermarkPosition, drawWatermark } from '../../core/services/image-processing.service';
import { JobProcessor } from '../../core/services/tool-session.service';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';
import {
  loadPreviewImageData,
  outputFormatForFile,
  renameFile,
} from '../../core/utils/image-tool-utils';

/** Longest side of the downscaled preview, in pixels. */
const PREVIEW_MAX_SIDE = 480;

@Component({
  selector: 'app-watermark-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './watermark.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Watermark extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'watermark';
  protected readonly form = this.fb.group({
    text: ['© ImageLab', [Validators.required, Validators.maxLength(120)]],
    position: this.fb.control<WatermarkPosition>('bottom-right'),
    sizePercent: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
    opacity: [50, [Validators.required, Validators.min(5), Validators.max(100)]],
    color: ['#ffffff', [Validators.required]],
  });

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');
  private readonly source = signal<ImageData | null>(null);
  private loadToken = 0;
  protected readonly previewReady = computed(() => this.source() !== null);

  private readonly style = toSignal(
    this.form.valueChanges.pipe(
      debounceTime(120),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  constructor() {
    super();

    this.registerForm(this.form);

    // Decode a downscaled snapshot of the selected file for the live preview.
    effect(() => {
      const file = this.selectedFile();
      const token = ++this.loadToken;
      if (!file) {
        this.source.set(null);
        return;
      }
      void loadPreviewImageData(file, PREVIEW_MAX_SIDE).then((data) => {
        if (token === this.loadToken) {
          this.source.set(data);
        }
      });
    });

    // Repaint whenever the snapshot, the style, or the canvas change.
    effect(() => {
      const data = this.source();
      const style = this.style();
      const canvas = this.canvasRef()?.nativeElement;
      if (!data || !canvas) {
        return;
      }

      canvas.width = data.width;
      canvas.height = data.height;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      context.putImageData(data, 0, 0);
      drawWatermark(context, data.width, data.height, style);
    });
  }

  protected override get errorMessage(): string {
    return 'The watermark could not be applied.';
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const style = this.form.getRawValue();

    return (file) => {
      const format = outputFormatForFile(file);
      return this.processing.renderWatermarked(file, {
        ...style,
        format,
        quality: 1,
        fileName: renameFile(file.name, 'watermarked', format),
      });
    };
  }
}
