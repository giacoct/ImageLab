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

import { MergeAlignment, MergeDirection, MergeResize } from '../../domain/merge-layout';
import { MergeSettings, drawMerged } from '../../services/canvas';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/** Longest side of the live preview canvas, in pixels. */
const PREVIEW_MAX_SIDE = 480;

/** Merge images: combines all selected images into one PNG, stacked vertically or side by side. */
@Component({
  selector: 'app-merge-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './merge.html',
  styleUrl: './merge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Merge extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'merge';
  protected readonly form = this.fb.group({
    direction: this.fb.control<MergeDirection>('vertical'),
    alignment: this.fb.control<MergeAlignment>('center'),
    resize: this.fb.control<MergeResize>('none'),
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

  /** Decoded bitmaps keyed by their source file, so reordering files() (e.g.
   *  drag-reorder on this page) reorders the preview without re-decoding. */
  private readonly bitmapByFile = signal(new Map<File, ImageBitmap>());
  private readonly bitmaps = computed(() => {
    const map = this.bitmapByFile();
    return this.files()
      .map((file) => map.get(file))
      .filter((bitmap): bitmap is ImageBitmap => bitmap !== undefined);
  });
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
      const canvas = this.canvasRef()?.nativeElement;
      if (canvas && bitmaps.length >= 2) {
        drawMerged(canvas, bitmaps, mergeSettings(this.options()), PREVIEW_MAX_SIDE);
      }
    });

    inject(DestroyRef).onDestroy(() => this.releaseBitmaps());
  }

  protected override canRun(): boolean {
    return this.enoughFiles();
  }

  /** Decode only newly added files for the preview, and release removed ones. */
  protected override async onFilesSelected(files: readonly File[]): Promise<void> {
    const current = this.bitmapByFile();
    const added = files.filter((file) => !current.has(file));
    const decoded = await Promise.all(
      added.map(async (file) => [file, await createImageBitmap(file)] as const),
    );

    // Rebuild from the latest state: another call may have finished meanwhile
    // (then keep its bitmap and drop our duplicate).
    const next = new Map(this.bitmapByFile());
    for (const [file, bitmap] of decoded) {
      if (next.has(file)) {
        bitmap.close();
      } else {
        next.set(file, bitmap);
      }
    }
    for (const [file, bitmap] of next) {
      if (!this.files().includes(file)) {
        bitmap.close();
        next.delete(file);
      }
    }
    this.bitmapByFile.set(next);
  }

  /** Merge produces one image from all files, not one per file. */
  protected override runJob(): Promise<void> {
    const options = { ...mergeSettings(this.form.getRawValue()), fileName: 'merged.png' };
    return this.session.runCombined((files) => this.processing.renderMerged(files, options));
  }

  private releaseBitmaps(): void {
    for (const bitmap of this.bitmapByFile().values()) {
      bitmap.close();
    }
    this.bitmapByFile.set(new Map());
  }
}

/** The merge the form describes (an unticked "transparent" paints the background color). */
function mergeSettings(value: {
  direction: MergeDirection;
  alignment: MergeAlignment;
  resize: MergeResize;
  transparent: boolean;
  background: string;
}): MergeSettings {
  const { direction, alignment, resize, transparent, background } = value;
  return { direction, alignment, resize, background: transparent ? null : background };
}
