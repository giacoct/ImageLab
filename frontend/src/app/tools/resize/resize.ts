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

import {
  AspectPreset,
  DragMode,
  FULL_CROP,
  NO_ROTATION,
  NormalizedCrop,
  Orientation,
  Rotation,
  applyDrag,
  centeredCrop,
  orientedSize,
  ratioFactor,
} from '../../domain/crop';
import { outputFormatForFile, renameFile } from '../../domain/image-files';
import { drawOriented } from '../../services/canvas';
import { JobProcessor } from '../../services/tool-session.service';
import { Icon } from '../../shared/icon/icon';
import { ToolHeader } from '../../shared/tool-header/tool-header';
import { BaseTool } from '../base-tool';

/**
 * Resize & transform (single image): rotate/flip, an interactive crop box with
 * aspect presets, and the output size — all previewed live on a canvas. Has
 * its own editor layout instead of the shared tool shell.
 */
@Component({
  selector: 'app-resize-tool',
  imports: [RouterLink, Icon, ToolHeader],
  templateUrl: './resize.html',
  styleUrl: './resize.css',
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
  protected readonly orientation = signal<Orientation>(NO_ROTATION);
  protected readonly crop = signal<NormalizedCrop>(FULL_CROP);
  protected readonly aspect = signal<AspectPreset>('free');
  protected readonly matchCrop = signal(true);
  protected readonly lockAspect = signal(true);
  protected readonly outputWidth = signal(1);
  protected readonly outputHeight = signal(1);

  protected readonly hasImage = computed(() => this.bitmap() !== null);

  /** Dimensions of the image after rotation (90°/270° swap axes). */
  private readonly oriented = computed(() =>
    orientedSize(this.bitmap() ?? { width: 1, height: 1 }, this.orientation().rotateDegrees),
  );

  protected readonly cropPixels = computed(() => {
    const size = this.oriented();
    const crop = this.crop();
    return {
      width: Math.max(1, Math.round(crop.width * size.width)),
      height: Math.max(1, Math.round(crop.height * size.height)),
    };
  });

  /** Free mode exposes all eight handles; a locked ratio uses corners only. */
  protected readonly handles = computed<DragMode[]>(() =>
    this.aspect() === 'free'
      ? ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      : ['ne', 'nw', 'se', 'sw'],
  );

  /** The in-progress crop drag (handle, last pointer position, canvas rect). */
  private drag: { mode: DragMode; startX: number; startY: number; rect: DOMRect } | null = null;

  constructor() {
    super();

    // Repaint the preview whenever the image or orientation changes.
    effect(() => {
      const bitmap = this.bitmap();
      const canvas = this.canvasRef()?.nativeElement;
      if (bitmap && canvas) {
        drawOriented(canvas, bitmap, this.orientation());
      }
    });

    // Keep the output size pinned to the crop while "match crop size" is on.
    effect(() => {
      const pixels = this.cropPixels();
      if (this.matchCrop()) {
        this.outputWidth.set(pixels.width);
        this.outputHeight.set(pixels.height);
      }
    });

    // Any change to the export settings invalidates an existing render.
    effect(() => {
      this.orientation();
      this.crop();
      this.outputWidth();
      this.outputHeight();
      this.session.markStale();
    });
  }

  /** Load the (single) image and reset every edit for it. */
  protected override async onFilesSelected(files: readonly File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      this.bitmap()?.close();
      this.bitmap.set(bitmap);
      this.orientation.set(NO_ROTATION);
      this.aspect.set('free');
      this.crop.set(FULL_CROP);
      this.matchCrop.set(true);
    } catch {
      this.error.set('The selected image could not be read.');
    }
  }

  protected rotate(): void {
    this.reorient((o) => ({ ...o, rotateDegrees: ((o.rotateDegrees + 90) % 360) as Rotation }));
  }

  protected toggleFlipH(): void {
    this.reorient((o) => ({ ...o, flipHorizontal: !o.flipHorizontal }));
  }

  protected toggleFlipV(): void {
    this.reorient((o) => ({ ...o, flipVertical: !o.flipVertical }));
  }

  /** Change the orientation; the crop no longer fits it, so it starts over. */
  private reorient(change: (orientation: Orientation) => Orientation): void {
    this.orientation.update(change);
    this.aspect.set('free');
    this.crop.set(FULL_CROP);
  }

  protected setAspect(preset: AspectPreset): void {
    this.aspect.set(preset);
    if (preset !== 'free') {
      this.crop.set(centeredCrop(ratioFactor(preset, this.oriented())));
    }
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
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
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

    const k = this.aspect() === 'free' ? null : ratioFactor(this.aspect(), this.oriented());
    this.crop.update((crop) => applyDrag(crop, drag.mode, dx, dy, k));
  }

  protected onPointerUp(): void {
    this.drag = null;
  }

  protected override createProcessor(): JobProcessor {
    const orientation = this.orientation();
    const crop = this.crop();
    const outputWidth = this.outputWidth();
    const outputHeight = this.outputHeight();

    return (file) => {
      const format = outputFormatForFile(file);
      return this.processing.renderEdit(file, {
        orientation,
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
    this.bitmap()?.close();
  }
}
