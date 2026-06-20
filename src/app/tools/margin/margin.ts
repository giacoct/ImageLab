import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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

import { MarginRenderOptions } from '../../core/services/image-processing.service';
import { JobProcessor } from '../../core/services/tool-session.service';
import { outputFormatForFile, renameFile } from '../../core/utils/image-tool-utils';
import {
  MarginSides,
  MarginUnit,
  marginFillStyle,
  paintMarginBands,
  resolveMarginSides,
} from '../../core/utils/margins';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';

/** Longest side of the downscaled preview, in pixels. */
const PREVIEW_MAX_SIDE = 480;

/** The raw form value, used to derive the effective per-side thicknesses. */
interface MarginFormValue {
  linked: boolean;
  all: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

@Component({
  selector: 'app-margin-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './margin.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Margin extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'margin';
  protected readonly form = this.fb.group({
    unit: this.fb.control<MarginUnit>('px'),
    linked: [true],
    all: [40, [Validators.required, Validators.min(0)]],
    top: [40, [Validators.required, Validators.min(0)]],
    right: [40, [Validators.required, Validators.min(0)]],
    bottom: [40, [Validators.required, Validators.min(0)]],
    left: [40, [Validators.required, Validators.min(0)]],
    color: ['#000000', [Validators.required]],
    opacity: [100, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');
  private readonly bitmap = signal<ImageBitmap | null>(null);
  protected readonly previewReady = computed(() => this.bitmap() !== null);

  private readonly options = toSignal(
    this.form.valueChanges.pipe(
      debounceTime(80),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  /** Upper bound for the thickness inputs — generous in px, capped in percent. */
  protected readonly maxThickness = computed(() => (this.options().unit === 'percent' ? 50 : 2000));

  constructor() {
    super();
    this.registerForm(this.form);

    // Decode the selected file once for the live preview; release it on change.
    effect((onCleanup) => {
      const file = this.selectedFile();
      if (!file) {
        this.bitmap.set(null);
        return;
      }
      let active = true;
      void createImageBitmap(file).then((bitmap) => {
        if (active) {
          this.bitmap.set(bitmap);
        } else {
          bitmap.close();
        }
      });
      onCleanup(() => {
        active = false;
        this.bitmap()?.close();
        this.bitmap.set(null);
      });
    });

    // Repaint whenever the snapshot, the settings, or the canvas change.
    effect(() => {
      const bitmap = this.bitmap();
      const options = this.options();
      const canvas = this.canvasRef()?.nativeElement;
      if (!bitmap || !canvas) {
        return;
      }

      const sides = resolveMarginSides(
        effectiveSides(options),
        options.unit,
        bitmap.width,
        bitmap.height,
      );
      const totalWidth = bitmap.width + sides.left + sides.right;
      const totalHeight = bitmap.height + sides.top + sides.bottom;
      const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(totalWidth, totalHeight));

      canvas.width = Math.max(1, Math.round(totalWidth * scale));
      canvas.height = Math.max(1, Math.round(totalHeight * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      const scaled: MarginSides = {
        top: Math.round(sides.top * scale),
        right: Math.round(sides.right * scale),
        bottom: Math.round(sides.bottom * scale),
        left: Math.round(sides.left * scale),
      };

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        bitmap,
        scaled.left,
        scaled.top,
        Math.round(bitmap.width * scale),
        Math.round(bitmap.height * scale),
      );
      paintMarginBands(
        context,
        canvas.width,
        canvas.height,
        scaled,
        marginFillStyle(options.color, options.opacity),
      );
    });

    inject(DestroyRef).onDestroy(() => this.bitmap()?.close());
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override createProcessor(): JobProcessor {
    const value = this.form.getRawValue();
    const sides = effectiveSides(value);

    return (file) => {
      // A semi-transparent margin needs an alpha-capable format.
      const format = value.opacity < 100 ? 'image/png' : outputFormatForFile(file);
      const options: MarginRenderOptions = {
        unit: value.unit,
        ...sides,
        color: value.color,
        opacity: value.opacity,
        format,
        quality: 1,
        fileName: renameFile(file.name, 'margin', format),
      };
      return this.processing.renderMargins(file, options);
    };
  }

  protected override get errorMessage(): string {
    return 'The margin could not be applied.';
  }
}

/** When sides are linked, the single `all` value drives every edge. */
function effectiveSides(value: MarginFormValue): MarginSides {
  if (value.linked) {
    return { top: value.all, right: value.all, bottom: value.all, left: value.all };
  }
  return { top: value.top, right: value.right, bottom: value.bottom, left: value.left };
}
