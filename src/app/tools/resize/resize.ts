import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { NormalizedCrop, RenderTransform } from '../../core/services/image-processing.service';
import { JobProcessor } from '../../core/services/tool-session.service';
import { StepIndicator } from '../../shared/step-indicator/step-indicator';
import { BaseTool } from '../shared/base-tool';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

type AspectPreset = 'free' | 'original' | '1:1' | '4:3' | '16:9';
type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_CROP = 0.05;
const FULL_CROP: NormalizedCrop = { x: 0, y: 0, width: 1, height: 1 };

@Component({
  selector: 'app-resize-tool',
  imports: [RouterLink, StepIndicator],
  templateUrl: './resize.html',
  styleUrls: ['../shared/tool-page.css', './resize.css'],
  host: {
    '(window:pointermove)': 'onPointerMove($event)',
    '(window:pointerup)': 'onPointerUp()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Resize extends BaseTool implements OnDestroy {
  protected readonly toolId = 'resize';

  protected readonly presets: readonly { value: AspectPreset; label: string }[] = [
    { value: 'free', label: 'Free' },
    { value: 'original', label: 'Original' },
    { value: '1:1', label: '1:1' },
    { value: '4:3', label: '4:3' },
    { value: '16:9', label: '16:9' },
  ];

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  private readonly bitmap = signal<ImageBitmap | null>(null);
  private readonly natural = signal({ width: 1, height: 1 });
  protected readonly rotateDegrees = signal<0 | 90 | 180 | 270>(0);
  protected readonly flipH = signal(false);
  protected readonly flipV = signal(false);
  protected readonly crop = signal<NormalizedCrop>(FULL_CROP);
  protected readonly aspect = signal<AspectPreset>('free');
  protected readonly matchCrop = signal(true);
  protected readonly lockAspect = signal(true);
  protected readonly outputWidth = signal(1);
  protected readonly outputHeight = signal(1);

  protected readonly hasImage = computed(() => this.bitmap() !== null);

  /** Dimensions of the image after rotate/flip (90°/270° swap axes). */
  private readonly transformed = computed(() => {
    const { width, height } = this.natural();
    const swaps = this.rotateDegrees() === 90 || this.rotateDegrees() === 270;
    return swaps ? { width: height, height: width } : { width, height };
  });

  protected readonly cropPixels = computed(() => {
    const t = this.transformed();
    const c = this.crop();
    return {
      width: Math.max(1, Math.round(c.width * t.width)),
      height: Math.max(1, Math.round(c.height * t.height)),
    };
  });

  /** Free mode exposes all eight handles; a locked ratio uses corners only. */
  protected readonly handles = computed<DragMode[]>(() =>
    this.aspect() === 'free'
      ? ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      : ['ne', 'nw', 'se', 'sw'],
  );

  private drag: { mode: DragMode; startX: number; startY: number; rect: DOMRect } | null = null;

  constructor() {
    super();

    // Repaint the preview whenever the image or transform changes.
    effect(() => {
      const bitmap = this.bitmap();
      const canvas = this.canvasRef()?.nativeElement;
      if (!bitmap || !canvas) {
        return;
      }
      this.paintPreview(canvas, bitmap);
    });

    // Keep the output size pinned to the crop while "match crop size" is on.
    effect(() => {
      const pixels = this.cropPixels();
      if (this.matchCrop()) {
        this.outputWidth.set(pixels.width);
        this.outputHeight.set(pixels.height);
      }
    });
  }

  protected override isFormValid(): boolean {
    return this.outputWidth() > 0 && this.outputHeight() > 0;
  }

  protected override async onFilesSelected(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      this.releaseBitmap();
      this.bitmap.set(bitmap);
      this.natural.set({ width: bitmap.width, height: bitmap.height });
      this.rotateDegrees.set(0);
      this.flipH.set(false);
      this.flipV.set(false);
      this.aspect.set('free');
      this.crop.set(FULL_CROP);
      this.matchCrop.set(true);
    } catch {
      this.error.set('The selected image could not be read.');
    }
  }

  protected rotate(): void {
    this.rotateDegrees.update((d) => ((d + 90) % 360) as 0 | 90 | 180 | 270);
    this.resetCrop();
  }

  protected toggleFlipH(): void {
    this.flipH.update((v) => !v);
    this.resetCrop();
  }

  protected toggleFlipV(): void {
    this.flipV.update((v) => !v);
    this.resetCrop();
  }

  private resetCrop(): void {
    this.aspect.set('free');
    this.crop.set(FULL_CROP);
  }

  protected setAspect(preset: AspectPreset): void {
    this.aspect.set(preset);
    if (preset === 'free') {
      return;
    }
    this.crop.set(centeredCrop(ratioFactor(preset, this.transformed())));
  }

  protected toggleMatchCrop(event: Event): void {
    this.matchCrop.set((event.target as HTMLInputElement).checked);
  }

  protected toggleLockAspect(event: Event): void {
    this.lockAspect.set((event.target as HTMLInputElement).checked);
  }

  protected onWidthInput(event: Event): void {
    const width = Math.max(1, Math.round((event.target as HTMLInputElement).valueAsNumber || 0));
    this.outputWidth.set(width);
    if (this.lockAspect()) {
      const pixels = this.cropPixels();
      this.outputHeight.set(Math.max(1, Math.round(width * (pixels.height / pixels.width))));
    }
  }

  protected onHeightInput(event: Event): void {
    const height = Math.max(1, Math.round((event.target as HTMLInputElement).valueAsNumber || 0));
    this.outputHeight.set(height);
    if (this.lockAspect()) {
      const pixels = this.cropPixels();
      this.outputWidth.set(Math.max(1, Math.round(height * (pixels.width / pixels.height))));
    }
  }

  protected startDrag(event: PointerEvent, mode: DragMode): void {
    event.preventDefault();
    event.stopPropagation();
    const wrap = (event.currentTarget as HTMLElement).closest('.stage-canvas-wrap');
    const canvas = this.canvasRef()?.nativeElement;
    if (!wrap || !canvas) {
      return;
    }
    this.drag = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      rect: canvas.getBoundingClientRect(),
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.rect.width === 0 || drag.rect.height === 0) {
      return;
    }
    const dx = (event.clientX - drag.startX) / drag.rect.width;
    const dy = (event.clientY - drag.startY) / drag.rect.height;
    this.drag = { ...drag, startX: event.clientX, startY: event.clientY };

    const k = this.aspect() === 'free' ? null : ratioFactor(this.aspect(), this.transformed());
    this.crop.update((c) => applyDrag(c, drag.mode, dx, dy, k));
  }

  protected onPointerUp(): void {
    this.drag = null;
  }

  protected override createProcessor(): JobProcessor {
    const transform: RenderTransform = {
      rotateDegrees: this.rotateDegrees(),
      flipHorizontal: this.flipH(),
      flipVertical: this.flipV(),
    };
    const crop = this.crop();
    const outputWidth = this.outputWidth();
    const outputHeight = this.outputHeight();

    return (file) => {
      const format = outputFormatForFile(file);
      return this.processing.renderEdit(file, {
        transform,
        crop,
        outputWidth,
        outputHeight,
        quality: 1,
        format,
        fileName: renameFile(file.name, 'edited', format),
      });
    };
  }

  ngOnDestroy(): void {
    this.releaseBitmap();
  }

  private releaseBitmap(): void {
    this.bitmap()?.close();
  }

  private paintPreview(canvas: HTMLCanvasElement, bitmap: ImageBitmap): void {
    const t = this.transformed();
    canvas.width = t.width;
    canvas.height = t.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((this.rotateDegrees() * Math.PI) / 180);
    context.scale(this.flipH() ? -1 : 1, this.flipV() ? -1 : 1);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2, bitmap.width, bitmap.height);
  }
}

/** Fraction-space height/width factor that preserves a pixel aspect ratio. */
function ratioFactor(preset: AspectPreset, transformed: { width: number; height: number }): number {
  const [rw, rh] =
    preset === '1:1'
      ? [1, 1]
      : preset === '4:3'
        ? [4, 3]
        : preset === '16:9'
          ? [16, 9]
          : [transformed.width, transformed.height];
  // hFrac = wFrac * (tW / tH) / (rw / rh)
  return (transformed.width / transformed.height) * (rh / rw);
}

/** Largest centered crop with the given fraction-space height factor `k`. */
function centeredCrop(k: number): NormalizedCrop {
  const width = k <= 1 ? 1 : 1 / k;
  const height = k <= 1 ? k : 1;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyDrag(
  crop: NormalizedCrop,
  mode: DragMode,
  dx: number,
  dy: number,
  k: number | null,
): NormalizedCrop {
  if (mode === 'move') {
    return {
      ...crop,
      x: Math.max(0, Math.min(1 - crop.width, crop.x + dx)),
      y: Math.max(0, Math.min(1 - crop.height, crop.y + dy)),
    };
  }

  let { x, y, width, height } = crop;
  const right = x + width;
  const bottom = y + height;
  const east = mode.includes('e');
  const west = mode.includes('w');
  const south = mode.includes('s');
  const north = mode.includes('n');

  if (east) width = clamp01(width + dx);
  if (west) {
    x = clamp01(Math.min(right - MIN_CROP, x + dx));
    width = right - x;
  }
  if (south) height = clamp01(height + dy);
  if (north) {
    y = clamp01(Math.min(bottom - MIN_CROP, y + dy));
    height = bottom - y;
  }

  width = Math.max(MIN_CROP, Math.min(width, 1 - x));
  height = Math.max(MIN_CROP, Math.min(height, 1 - y));

  if (k !== null) {
    // Keep the ratio by deriving height from width, anchored at the fixed corner.
    height = Math.min(width * k, 1);
    width = height / k;
    if (north) y = bottom - height;
    if (west) x = right - width;
    x = clamp01(Math.min(x, 1 - width));
    y = clamp01(Math.min(y, 1 - height));
  }

  return { x, y, width, height };
}
