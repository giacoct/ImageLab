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
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, map } from 'rxjs';

import { MergeOptions } from '../../core/services/image-processing.service';
import { computeMergeLayout } from '../../core/utils/merge-layout';
import { BaseTool } from '../../pages/settings/base-tool';
import { ToolShell } from '../../pages/settings/tool-shell';

/** Longest side of the live preview canvas, in pixels. */
const PREVIEW_MAX_SIDE = 480;

@Component({
  selector: 'app-merge-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './merge.html',
  styleUrl: '../../pages/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Merge extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'merge';
  protected readonly form = this.fb.group({
    direction: this.fb.control<'horizontal' | 'vertical'>('vertical'),
    alignment: this.fb.control<'start' | 'center' | 'end'>('center'),
    resize: this.fb.control<'none' | 'fill'>('none'),
    transparent: [true],
    background: ['#ffffff'],
  });

  /** Merge needs at least two images to do anything meaningful. */
  protected readonly enoughFiles = computed(() => this.files().length >= 2);

  /** The alignment axis depends on the stack direction, so relabel the choices. */
  protected readonly alignLabels = computed(() =>
    this.options().direction === 'vertical'
      ? { heading: 'Horizontal alignment', start: 'Left', center: 'Center', end: 'Right' }
      : { heading: 'Vertical alignment', start: 'Top', center: 'Middle', end: 'Bottom' },
  );

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  /** Decoded bitmaps for the current files (decoded once per import). */
  private readonly bitmaps = signal<ImageBitmap[]>([]);
  protected readonly previewReady = computed(() => this.bitmaps().length >= 2);

  private readonly options = toSignal(
    this.form.valueChanges.pipe(
      debounceTime(80),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  constructor() {
    super();
    this.registerForm(this.form);

    // Repaint whenever the bitmaps, the options, or the canvas change.
    effect(() => {
      const bitmaps = this.bitmaps();
      const options = this.options();
      const canvas = this.canvasRef()?.nativeElement;
      if (!canvas || bitmaps.length < 2) {
        return;
      }

      const layout = computeMergeLayout(
        bitmaps.map((bitmap) => ({ width: bitmap.width, height: bitmap.height })),
        options,
      );
      if (layout.width === 0 || layout.height === 0) {
        return;
      }

      const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(layout.width, layout.height));
      canvas.width = Math.max(1, Math.round(layout.width * scale));
      canvas.height = Math.max(1, Math.round(layout.height * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!options.transparent) {
        context.fillStyle = options.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      layout.placements.forEach((place, i) => {
        context.drawImage(
          bitmaps[i],
          place.x * scale,
          place.y * scale,
          place.width * scale,
          place.height * scale,
        );
      });
    });

    inject(DestroyRef).onDestroy(() => this.releaseBitmaps());
  }

  protected override isFormValid(): boolean {
    return this.enoughFiles() && this.form.valid;
  }

  protected override get errorMessage(): string {
    return 'The images could not be merged.';
  }

  protected override async onFilesSelected(files: File[]): Promise<void> {
    this.releaseBitmaps();
    this.bitmaps.set(await Promise.all(files.map((file) => createImageBitmap(file))));
  }

  protected override runJob(): Promise<void> {
    const { direction, alignment, resize, transparent, background } = this.form.getRawValue();
    const options: MergeOptions = {
      direction,
      alignment,
      resize,
      background: transparent ? null : background,
      fileName: 'merged.png',
    };
    return this.session.runCombined(
      (files) => this.processing.renderMerged(files, options),
      this.errorMessage,
    );
  }

  private releaseBitmaps(): void {
    for (const bitmap of this.bitmaps()) {
      bitmap.close();
    }
    this.bitmaps.set([]);
  }
}
