import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
  viewChildren,
} from '@angular/core';

import { OcrResult } from '../../domain/ocr-result.model';

/**
 * An image with a transparent, selectable text layer on top — one positioned
 * span per recognized word. Each word is placed by its fractional box (so it
 * scales with the displayed image) and horizontally scaled to fill that box, in
 * the spirit of a PDF.js text layer. Dragging across the words highlights the
 * real (invisible) text right where it sits on the picture, and it copies as
 * normal text.
 */
@Component({
  selector: 'app-ocr-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ocr-image.css',
  templateUrl: './ocr-image.html',
})
export class OcrImage {
  readonly result = input.required<OcrResult>();

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly img = viewChild.required<ElementRef<HTMLImageElement>>('img');
  private readonly words = viewChildren<ElementRef<HTMLElement>>('word');
  private observer?: ResizeObserver;

  constructor() {
    // Re-fit the words whenever the result (and so the rendered spans) changes.
    effect(() => {
      this.result();
      this.words();
      this.relayout();
    });

    afterNextRender(() => {
      this.observer = new ResizeObserver(() => this.relayout());
      this.observer.observe(this.stage().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  /** Size each word's font to its box height, then scale it to the box width. */
  protected relayout(): void {
    const img = this.img().nativeElement;
    const width = img.clientWidth;
    const height = img.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    const spans = this.words();
    this.result().words.forEach((word, i) => {
      const el = spans[i]?.nativeElement;
      if (!el) {
        return;
      }
      el.style.fontSize = `${word.height * height}px`;
      el.style.transform = 'none';
      const naturalWidth = el.getBoundingClientRect().width;
      const targetWidth = word.width * width;
      el.style.transform = naturalWidth > 0 ? `scaleX(${targetWidth / naturalWidth})` : 'none';
    });
  }
}
