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

import { outputFormatForFile, renameFile } from '../../domain/image-files';
import { MarginUnit } from '../../domain/margins';
import { MarginSettings, drawMargins } from '../../services/canvas';
import { JobProcessor } from '../../services/tool-session.service';
import { Icon } from '../../shared/icon/icon';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/** Longest side of the downscaled preview, in pixels. */
const PREVIEW_MAX_SIDE = 480;

/** The raw form value, from which {@link marginSettings} derives the margin. */
interface MarginFormValue {
  unit: MarginUnit;
  color: string;
  opacity: number;
  linked: boolean;
  all: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Add margin: surrounds images with a colored or (semi-)transparent border, uniform or per side. */
@Component({
  selector: 'app-margin-tool',
  imports: [ToolShell, ReactiveFormsModule, Icon],
  templateUrl: './margin.html',
  styleUrl: './margin.css',
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
      const canvas = this.canvasRef()?.nativeElement;
      if (bitmap && canvas) {
        drawMargins(canvas, bitmap, marginSettings(this.options()), PREVIEW_MAX_SIDE);
      }
    });

    inject(DestroyRef).onDestroy(() => this.bitmap()?.close());
  }

  /** Toggle the link control. Unlinking seeds each side from the shared value. */
  protected toggleLinked(): void {
    const linked = !this.form.controls.linked.value;
    if (linked) {
      this.form.patchValue({ linked });
      return;
    }
    const all = this.form.controls.all.value;
    this.form.patchValue({ linked, top: all, right: all, bottom: all, left: all });
  }

  protected override createProcessor(): JobProcessor {
    const margin = marginSettings(this.form.getRawValue());

    return (file) => {
      // A semi-transparent margin needs an alpha-capable format.
      const format = margin.opacity < 100 ? 'image/png' : outputFormatForFile(file);
      return this.processing.renderMargins(file, {
        ...margin,
        format,
        quality: 1,
        fileName: renameFile(file.name, 'margin', format),
      });
    };
  }
}

/** The margin the form describes: when sides are linked, `all` drives every edge. */
function marginSettings(value: MarginFormValue): MarginSettings {
  const { unit, color, opacity, linked, all } = value;
  const sides = linked
    ? { top: all, right: all, bottom: all, left: all }
    : { top: value.top, right: value.right, bottom: value.bottom, left: value.left };
  return { unit, color, opacity, ...sides };
}
