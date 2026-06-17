import { Directive, ElementRef, inject, output, signal } from '@angular/core';

/**
 * Pointer-based drag-to-reorder for a list, working with both mouse and touch
 * (HTML5 drag-and-drop doesn't fire on touch devices, so iPads/phones can't use
 * it). Apply to the list container and mark each reorderable child with
 * `data-reorder-item` and a drag handle inside it with `data-reorder-handle`.
 *
 * The directive reports the in-progress drag via {@link activeIndex} /
 * {@link overIndex} (read these for styling) and emits {@link reorder} with the
 * source and target indices once the drag settles on a different item.
 *
 *     <ul appReorderable #ro="reorderable" (reorder)="move($event.from, $event.to)">
 *       @for (item of items(); track item.id; let i = $index) {
 *         <li data-reorder-item [class.is-dragging]="ro.activeIndex() === i">
 *           <span data-reorder-handle>⠿</span> {{ item.name }}
 *         </li>
 *       }
 *     </ul>
 *
 * Give the handle `touch-action: none` so a touch-drag reorders instead of
 * scrolling the page.
 */
@Directive({
  selector: '[appReorderable]',
  exportAs: 'reorderable',
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
  },
})
export class Reorderable {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly reorder = output<{ from: number; to: number }>();

  /** Index of the item being dragged, or null when idle. */
  readonly activeIndex = signal<number | null>(null);
  /** Index the dragged item is currently hovering over, or null when idle. */
  readonly overIndex = signal<number | null>(null);

  private pointerId: number | null = null;

  private items(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[data-reorder-item]'),
    );
  }

  private indexOfPoint(x: number, y: number): number {
    const element = document.elementFromPoint(x, y);
    const item = element?.closest('[data-reorder-item]');
    return item ? this.items().indexOf(item as HTMLElement) : -1;
  }

  protected onPointerDown(event: PointerEvent): void {
    const handle = (event.target as HTMLElement).closest('[data-reorder-handle]');
    const item = handle?.closest('[data-reorder-item]') as HTMLElement | null;
    if (!item) {
      return;
    }
    const index = this.items().indexOf(item);
    if (index < 0) {
      return;
    }

    // Claim the gesture: capture so we keep getting moves even if the finger
    // slides off the handle, and preventDefault so touch doesn't also scroll.
    event.preventDefault();
    this.pointerId = event.pointerId;
    try {
      this.host.nativeElement.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture for an already-released pointer; the drag
      // still works without it as long as moves keep arriving.
    }
    this.activeIndex.set(index);
    this.overIndex.set(index);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId || this.activeIndex() === null) {
      return;
    }
    event.preventDefault();
    const index = this.indexOfPoint(event.clientX, event.clientY);
    if (index >= 0) {
      this.overIndex.set(index);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) {
      return;
    }
    const from = this.activeIndex();
    const to = this.overIndex();
    if (from !== null && to !== null && from !== to) {
      this.reorder.emit({ from, to });
    }

    const node = this.host.nativeElement;
    try {
      if (node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture may already be gone; nothing to release.
    }
    this.pointerId = null;
    this.activeIndex.set(null);
    this.overIndex.set(null);
  }
}
