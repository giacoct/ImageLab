/**
 * Latest-wins preview requests. While a render is in flight, newer requests
 * replace each other and only the last one is sent when it finishes, so
 * dragging a slider never queues up stale renders.
 */

import { engine } from '../engine/client';
import type { Requests } from '../engine/protocol';

type Args = Requests['preview']['args'];

export class Previewer {
  private inFlight = false;
  private next: Args | null = null;

  constructor(
    private readonly onImage: (bitmap: ImageBitmap) => void,
    private readonly onError: (message: string) => void,
    private readonly onBusy: (busy: boolean) => void = () => {},
  ) {}

  request(args: Args): void {
    this.next = args;
    if (!this.inFlight) void this.pump();
  }

  private async pump(): Promise<void> {
    this.inFlight = true;
    this.onBusy(true);
    while (this.next) {
      const args = this.next;
      this.next = null;
      try {
        const bitmap = await engine.preview(args);
        if (this.next)
          bitmap.close(); // already outdated
        else this.onImage(bitmap);
      } catch (error) {
        if (!this.next)
          this.onError(error instanceof Error ? error.message : String(error));
      }
    }
    this.inFlight = false;
    this.onBusy(false);
  }
}

/** Draw a preview bitmap into a canvas (resizing it to match) and release the bitmap. */
export function drawBitmap(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
): void {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, canvas.width, canvas.height);
  context?.drawImage(bitmap, 0, 0);
  bitmap.close();
}
