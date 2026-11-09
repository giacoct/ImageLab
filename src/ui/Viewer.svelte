<!--
  The live preview, to look at closely: the open tool rendered by the engine
  on the picked image (on all of them for a merge), with the same operations
  that applying uses. It fits the stage; zoom with the wheel, a pinch, a
  double click or the buttons, and drag to move around. The zoom is shown
  relative to the real image (100% = one image pixel per screen point).

  Adjust & filters is live: the engine renders the plain image, and the GPU
  redraws it at every move of a slider (`engine/live.ts`). Without WebGL2,
  or if the GPU drops it, the engine renders it like every other tool.
-->
<script lang="ts">
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import { untrack } from "svelte";

  import { drawBitmap, Previewer } from "../app/previewer";
  import { session } from "../app/session.svelte";
  import { isLive, LiveAdjust, type LiveSettings } from "../engine/live";

  let canvas = $state<HTMLCanvasElement>();
  let stage = $state<HTMLDivElement>();
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let error = $state("");
  let busy = $state(false);
  /** Size of the result the preview stands for, once a render arrived. */
  let real = $state<{ width: number; height: number } | null>(null);

  /** Zoom relative to fitting the stage (≥ 1), and the pan from the center, in CSS px. */
  let zoom = $state(1);
  let pan = $state({ x: 0, y: 0 });

  /** The GPU renderer, while the open tool is live. */
  let renderer = $state.raw<LiveAdjust | null>(null);
  let gpuFailed = $state(false);
  /** The plain image the GPU adjusts, as the engine last rendered it. */
  let source = $state.raw<{ bitmap: ImageBitmap; scale: number } | null>(null);

  const previewer = new Previewer(
    ({ bitmap, scale }) => {
      real = { width: bitmap.width / scale, height: bitmap.height / scale };
      if (live) {
        source?.bitmap.close();
        source = { bitmap, scale };
      } else if (canvas) drawBitmap(canvas, bitmap);
      else bitmap.close();
      error = "";
    },
    (message) => (error = message),
    (value) => (busy = value),
  );

  const PADDING = 24;
  /** The most the image is enlarged: 8 image pixels per point. */
  const MAX_SCALE = 8;

  const op = $derived(session.op);
  const live = $derived(!!op && isLive(op.id) && !gpuFailed);
  const shown = $derived(
    op?.kind === "combine"
      ? session.items
      : session.selected
        ? [session.selected]
        : [],
  );
  /** Scale (CSS px per image pixel) at which the image fits the stage; never enlarged. */
  const fit = $derived(
    real && stageWidth
      ? Math.min(
          1,
          (stageWidth - PADDING * 2) / real.width,
          (stageHeight - PADDING * 2) / real.height,
        )
      : 1,
  );
  const maxZoom = $derived(Math.max(1, MAX_SCALE / fit));
  const scale = $derived(fit * zoom);
  const size = $derived(
    real
      ? { width: real.width * scale, height: real.height * scale }
      : { width: 0, height: 0 },
  );

  // Back to fitting the image when another one is shown or the tool changes.
  $effect(() => {
    void shown.map((item) => item.id).join();
    void session.tool?.op;
    untrack(() => resetZoom());
  });

  // Re-render when the tool, its settings, the images or the zoom change.
  // Zoomed in, the render is larger (up to the engine's preview size). A live
  // tool's settings are left to the GPU: the engine renders the plain image.
  $effect(() => {
    const action =
      !live && session.tool && op?.kind !== "final"
        ? $state.snapshot(session.tool)
        : null;
    if (shown.length === 0) {
      real = null;
      return;
    }
    const longest = Math.max(stageWidth, stageHeight, 320);
    const maxSide = Math.round(longest * devicePixelRatio * zoom);
    const images = shown.map(({ id, version }) => ({ key: id, version }));
    untrack(() => previewer.request({ images, action, maxSide }));
  });

  // The GPU draws the latest settings on the next frame, however many
  // changes came in since the last one.
  $effect(() => {
    if (!renderer || !source || !session.tool) return;
    const draw = renderer;
    const { bitmap, scale } = source;
    const settings = $state.snapshot(session.tool.params) as unknown;
    const frame = requestAnimationFrame(() =>
      draw.draw(bitmap, settings as LiveSettings, scale),
    );
    return () => cancelAnimationFrame(frame);
  });

  /** Attached to the canvas while the tool is live: draws on it with the GPU. */
  function startGpu(element: HTMLCanvasElement) {
    const created = LiveAdjust.create(element, () => (gpuFailed = true));
    if (!created) {
      gpuFailed = true;
      return;
    }
    renderer = created;
    return () => {
      created.dispose();
      renderer = null;
      source?.bitmap.close();
      source = null;
    };
  }

  function resetZoom(): void {
    zoom = 1;
    pan = { x: 0, y: 0 };
  }

  /** Keep the image from being dragged out of view. */
  function clampPan(x: number, y: number): { x: number; y: number } {
    const limitX = Math.max(0, (size.width - stageWidth) / 2 + PADDING);
    const limitY = Math.max(0, (size.height - stageHeight) / 2 + PADDING);
    return {
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(-limitY, Math.min(limitY, y)),
    };
  }

  /** Zoom to `next`, keeping the point at `at` (from the stage's center) still. */
  function zoomTo(next: number, at = { x: 0, y: 0 }): void {
    const clamped = Math.max(1, Math.min(maxZoom, next));
    if (clamped === 1) {
      resetZoom();
      return;
    }
    const ratio = clamped / zoom;
    zoom = clamped;
    pan = clampPan(
      at.x - (at.x - pan.x) * ratio,
      at.y - (at.y - pan.y) * ratio,
    );
  }

  /** A point of a pointer or wheel event, relative to the stage's center. */
  function fromCenter(event: { clientX: number; clientY: number }) {
    const rect = stage!.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  }

  // Wheel and trackpad pinch (a wheel event with ctrlKey) zoom. Added by hand:
  // it must not be passive, to keep the page from scrolling or zooming.
  $effect(() => {
    const element = stage;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!real) return;
      event.preventDefault();
      const speed = event.ctrlKey ? 0.01 : 0.002;
      zoomTo(zoom * Math.exp(-event.deltaY * speed), fromCenter(event));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  });

  // Drag to pan; two fingers pinch to zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; zoom: number } | null = null;

  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onPointerDown(event: PointerEvent): void {
    if (!real || event.button !== 0) return;
    // Capturing would take the click away from the zoom buttons.
    if ((event.target as Element).closest("button")) return;
    stage!.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, fromCenter(event));
    if (pointers.size === 2) pinch = { distance: distance(), zoom };
  }

  function onPointerMove(event: PointerEvent): void {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const point = fromCenter(event);
    pointers.set(event.pointerId, point);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomTo((pinch.zoom * distance()) / pinch.distance, middle);
    } else if (pointers.size === 1 && zoom > 1) {
      pan = clampPan(pan.x + point.x - last.x, pan.y + point.y - last.y);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  }

  /** Double click: fit ↔ real size (or 2× a small image) at that point. */
  function onDoubleClick(event: MouseEvent): void {
    if (!real) return;
    if (zoom > 1) resetZoom();
    else zoomTo(Math.max(2, 1 / fit), fromCenter(event));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "+" || event.key === "=") zoomTo(zoom * 1.5);
    else if (event.key === "-") zoomTo(zoom / 1.5);
    else if (event.key === "0") resetZoom();
    else return;
    event.preventDefault();
  }
</script>

<!--
  An application region: focusable, with its own keys (+ − 0) and pointer
  gestures, which Svelte's checks don't count as interactive.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="stage"
  class:zoomed={zoom > 1}
  bind:this={stage}
  bind:clientWidth={stageWidth}
  bind:clientHeight={stageHeight}
  role="application"
  aria-roledescription="zoomable preview"
  aria-label={op ? `Preview of ${op.title}` : "The picked image"}
  tabindex={real ? 0 : -1}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  ondblclick={onDoubleClick}
  onkeydown={onKeyDown}
>
  <!-- A new canvas when that changes: one drawn by the GPU can't take 2D drawing. -->
  {#key live}
    <canvas
      bind:this={canvas}
      {@attach live && startGpu}
      class="checker"
      class:hidden={!real || shown.length === 0}
      class:pixels={scale >= 2}
      style:width="{size.width}px"
      style:height="{size.height}px"
      style:transform="translate(calc(-50% + {pan.x}px), calc(-50% + {pan.y}px))"
    ></canvas>
  {/key}

  {#if error && shown.length}
    <p class="notice error message">{error}</p>
  {/if}

  {#if busy && real}<span class="busy hint">Updating…</span>{/if}

  {#if real && shown.length}
    <div class="zoom" role="group" aria-label="Zoom">
      <button
        class="icon quiet"
        type="button"
        aria-label="Zoom out"
        disabled={zoom <= 1}
        onclick={() => zoomTo(zoom / 1.5)}><Minus size={16} /></button
      >
      <button
        class="quiet level numbers"
        type="button"
        title="Fit to the screen"
        onclick={resetZoom}
        >{zoom > 1 ? `${Math.round(scale * 100)}%` : "Fit"}</button
      >
      <button
        class="icon quiet"
        type="button"
        aria-label="Zoom in"
        disabled={zoom >= maxZoom}
        onclick={() => zoomTo(zoom * 1.5)}><Plus size={16} /></button
      >
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--stage);
    height: 100%;
    min-height: 12rem;
    overflow: hidden;
    position: relative;
    touch-action: none;
    user-select: none;
  }

  .stage.zoomed {
    cursor: grab;
  }

  .stage.zoomed:active {
    cursor: grabbing;
  }

  canvas {
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
    left: 50%;
    position: absolute;
    top: 50%;
  }

  /* Enlarged, show the pixels as squares: that's what zooming in is for. */
  canvas.pixels {
    image-rendering: pixelated;
  }

  .hidden {
    visibility: hidden;
  }

  .message {
    left: 1rem;
    position: absolute;
    right: 1rem;
    top: 1rem;
  }

  .busy {
    left: 0.75rem;
    position: absolute;
    top: 0.6rem;
  }

  .zoom {
    background: var(--sheet);
    border-radius: var(--radius);
    bottom: 0.75rem;
    box-shadow: 0 0 0 1px var(--line);
    display: flex;
    padding: 2px;
    position: absolute;
    right: 0.75rem;
  }

  .zoom button {
    min-height: 2rem;
  }

  .level {
    min-width: 3.5rem;
    padding: 0 0.4rem;
  }
</style>
