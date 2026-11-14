/**
 * Latest-wins preview requests. While a render is in flight, newer requests
 * replace each other and only the last one is sent when it finishes, so
 * dragging a slider never queues up stale renders.
 */

export class Previewer<Args, Image extends { bitmap: ImageBitmap }> {
  private inFlight = false;
  private next: Args | null = null;

  /** `render` is the engine's call: `engine.preview` or `engine.detail`. */
  constructor(
    private readonly render: (args: Args) => Promise<Image>,
    private readonly onImage: (image: Image) => void,
    private readonly onError: (message: string) => void,
    private readonly onBusy: (busy: boolean) => void = () => {},
  ) {}

  request(args: Args): void {
    this.next = args;
    if (!this.inFlight) void this.pump();
  }

  /** Drop the request waiting, if any. */
  forget(): void {
    this.next = null;
  }

  private async pump(): Promise<void> {
    this.inFlight = true;
    this.onBusy(true);
    while (this.next) {
      const args = this.next;
      this.next = null;
      try {
        const image = await this.render(args);
        if (this.next)
          image.bitmap.close(); // already outdated
        else this.onImage(image);
      } catch (error) {
        if (!this.next)
          this.onError(error instanceof Error ? error.message : String(error));
      }
    }
    this.inFlight = false;
    this.onBusy(false);
  }
}

/**
 * Draw a preview bitmap into a canvas (resizing it to match) and release the
 * bitmap. The canvas is in Display P3 where the browser has it, so a
 * wide-gamut image keeps its colors (an sRGB one looks the same in it).
 */
export function drawBitmap(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
): void {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { colorSpace: "display-p3" });
  context?.clearRect(0, 0, canvas.width, canvas.height);
  context?.drawImage(bitmap, 0, 0);
  bitmap.close();
}
