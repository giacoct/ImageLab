<!--
  The live preview, to look at closely: the open tool rendered by the engine
  on the picked image (on all of them for a merge), with the same operations
  that applying uses. It fits the stage; zoom with the wheel, a pinch, a
  double click or the buttons, and drag to move around. The zoom is shown
  relative to the real image (100% = one image pixel per screen point).
  Zoomed in further than the preview's pixels go, the part in view is
  rendered again from the full-size image (`renderDetail`), over it.

  Adjust & filters is live: the engine renders the plain image, and the GPU
  redraws it at every move of a slider (`engine/live.ts`). Without WebGL2,
  or if the GPU drops it, the engine renders it like every other tool.

  While a color setting is being picked (`session.picking`), it shows the
  image as it is, and a tap or click on it sets that color. For Add margin,
  handles on the edges set the margins (`MarginHandles`).
-->
<script lang="ts">
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import { onDestroy, untrack } from "svelte";

  import { drawBitmap, Previewer } from "../app/previewer";
  import { engine } from "../engine/client";
  import type { Region } from "../engine/pipeline";
  import { session } from "../app/session.svelte";
  import { colorAt } from "../core/background";
  import { isLive, LiveAdjust, type LiveSettings } from "../engine/live";
  import MarginHandles, { type Side } from "./MarginHandles.svelte";

  let canvas = $state<HTMLCanvasElement>();
  let stage = $state<HTMLDivElement>();
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let error = $state("");
  let busy = $state(false);
  /** Size of the result the preview stands for, once a render arrived. */
  let real = $state<{ width: number; height: number } | null>(null);
  /** The preview's pixels per pixel of that result. */
  let density = $state(1);
  /** The part shown sharper, over the preview, and what it was rendered for. */
  let detailCanvas = $state<HTMLCanvasElement>();
  let detail = $state.raw<{
    region: Region;
    density: number;
    /** The density asked: more than it has if the image was too large for it. */
    asked: number;
    signature: string;
  } | null>(null);
  let detailBusy = $state(false);

  /** Zoom relative to fitting the stage (≥ 1), and the pan from the center, in CSS px. */
  let zoom = $state(1);
  let pan = $state({ x: 0, y: 0 });

  /**
   * While a margin handle is dragged: the scale and the size of the image
   * when it was grabbed, so the zoom holds and the image stays in place.
   */
  let held = $state<{
    side: Side;
    fit: number;
    width: number;
    height: number;
  } | null>(null);

  /** The GPU renderer, while the open tool is live. */
  let renderer = $state.raw<LiveAdjust | null>(null);
  let gpuFailed = $state(false);
  /** The plain image the GPU adjusts, as the engine last rendered it. */
  let source = $state.raw<{
    bitmap: ImageBitmap;
    scale: number;
    colorSpace: PredefinedColorSpace;
  } | null>(null);

  const previewer = new Previewer(
    engine.preview.bind(engine),
    ({ bitmap, scale, colorSpace }) => {
      real = { width: bitmap.width / scale, height: bitmap.height / scale };
      density = scale;
      if (live) {
        source?.bitmap.close();
        source = { bitmap, scale, colorSpace };
      } else if (canvas) drawBitmap(canvas, bitmap);
      else bitmap.close();
      error = "";
    },
    (message) => (error = message),
    (value) => (busy = value),
  );

  // The full-size images held for details take a lot of memory.
  onDestroy(() => engine.dropDetails());

  /** What the next detail is asked for, to label the one that comes back. */
  let asking = { signature: "", density: 0 };
  const detailer = new Previewer(
    engine.detail.bind(engine),
    ({ bitmap, region, density }) => {
      if (!detailCanvas) return bitmap.close();
      drawBitmap(detailCanvas, bitmap);
      detail = {
        region,
        density,
        asked: asking.density,
        signature: asking.signature,
      };
    },
    // The preview stays as it is: only less sharp.
    () => {},
    (value) => (detailBusy = value),
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
    held
      ? held.fit
      : real && stageWidth
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
  /**
   * While a margin handle is held, how far the image moves so that only the
   * dragged edge does: it would grow on both sides, being centered. (Not
   * when every side's margin is the same: they all move.)
   */
  const shift = $derived.by(() => {
    if (!held || !real || session.tool?.params.same) return { x: 0, y: 0 };
    const x = ((real.width - held.width) / 2) * scale;
    const y = ((real.height - held.height) / 2) * scale;
    return {
      top: { x: 0, y: -y },
      right: { x, y: 0 },
      bottom: { x: 0, y },
      left: { x: -x, y: 0 },
    }[held.side];
  });
  const placement = $derived(
    `translate(calc(-50% + ${pan.x + shift.x}px), calc(-50% + ${pan.y + shift.y}px))`,
  );

  /** The tool as a detail renders it: live tools too (it's the engine that does). */
  const detailAction = $derived(
    !session.picking && session.tool && op?.kind !== "final"
      ? session.tool
      : null,
  );
  /** What a detail shows: when this changes, the one there is out of date. */
  const signature = $derived(
    JSON.stringify([shown.map((item) => item.id), detailAction]),
  );
  const sharp = $derived(detail?.signature === signature ? detail : null);
  /** Pixels on the screen per pixel of the result. */
  const wanted = $derived(scale * devicePixelRatio);

  /**
   * The part of the result in view, in fractions of its size, `margin`
   * screens wider on each side, or null if nothing is shown.
   */
  function inView(margin: number): Region | null {
    if (!real || !size.width || !size.height) return null;
    const left = stageWidth / 2 + pan.x + shift.x - size.width / 2;
    const top = stageHeight / 2 + pan.y + shift.y - size.height / 2;
    const x0 = Math.max(0, (-stageWidth * margin - left) / size.width);
    const y0 = Math.max(0, (-stageHeight * margin - top) / size.height);
    const x1 = Math.min(1, (stageWidth * (1 + margin) - left) / size.width);
    const y1 = Math.min(1, (stageHeight * (1 + margin) - top) / size.height);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  const covers = (outer: Region, inner: Region) =>
    outer.x <= inner.x + 1e-6 &&
    outer.y <= inner.y + 1e-6 &&
    outer.x + outer.width >= inner.x + inner.width - 1e-6 &&
    outer.y + outer.height >= inner.y + inner.height - 1e-6;

  // Zoomed in past the preview's pixels, once the view rests a moment:
  // render the part in view (and some around it) at full size, unless the
  // detail there already covers it as sharp as it gets.
  $effect(() => {
    const view = inView(0);
    const needed = Math.min(1, wanted);
    if (!view || zoom <= 1 || needed <= density * 1.25 || held) {
      detailer.forget();
      return;
    }
    if (
      sharp &&
      covers(sharp.region, view) &&
      (sharp.density >= needed || sharp.density < Math.min(1, sharp.asked))
    )
      return;
    const region = inView(0.5)!;
    const images = shown.map(({ id, version }) => ({ key: id, version }));
    const action = $state.snapshot(detailAction);
    const current = signature;
    const timer = setTimeout(() => {
      asking = { signature: current, density: wanted };
      detailer.request({ images, action, region, density: wanted });
    }, 150);
    return () => clearTimeout(timer);
  });

  function hold(side: Side | null): void {
    held = side && real ? { side, fit, ...real } : null;
  }

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
      !live && !session.picking && session.tool && op?.kind !== "final"
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
    const { bitmap, scale, colorSpace } = source;
    const settings = $state.snapshot(session.tool.params) as unknown;
    const frame = requestAnimationFrame(() =>
      draw.draw(bitmap, settings as LiveSettings, scale, colorSpace),
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
  /** A press that may be a tap: one finger, not moved since it went down. */
  let tap: { id: number; x: number; y: number } | null = null;

  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onPointerDown(event: PointerEvent): void {
    if (!real || event.button !== 0) return;
    // Capturing would take the click away from the zoom buttons.
    if ((event.target as Element).closest("button")) return;
    stage!.setPointerCapture(event.pointerId);
    const point = fromCenter(event);
    pointers.set(event.pointerId, point);
    tap = pointers.size === 1 ? { id: event.pointerId, ...point } : null;
    if (pointers.size === 2) pinch = { distance: distance(), zoom };
  }

  function onPointerMove(event: PointerEvent): void {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const point = fromCenter(event);
    pointers.set(event.pointerId, point);
    if (tap && Math.hypot(point.x - tap.x, point.y - tap.y) > 6) tap = null;
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
    if (tap?.id === event.pointerId && event.type === "pointerup")
      pickAt(fromCenter(event));
    tap = null;
  }

  /**
   * Set the color being picked to the image's at `point` (from the stage's
   * center): from the sharper detail where there's one.
   */
  function pickAt(point: { x: number; y: number }): void {
    const key = session.picking;
    if (!key || !canvas || !size.width) return;
    // Where in the result, in fractions of its size.
    let fx = (point.x - pan.x) / size.width + 0.5;
    let fy = (point.y - pan.y) / size.height + 0.5;
    let from = canvas;
    if (sharp && detailCanvas) {
      const { region } = sharp;
      const dx = (fx - region.x) / region.width;
      const dy = (fy - region.y) / region.height;
      if (dx >= 0 && dy >= 0 && dx < 1 && dy < 1) {
        [fx, fy, from] = [dx, dy, detailCanvas];
      }
    }
    const x = Math.floor(fx * from.width);
    const y = Math.floor(fy * from.height);
    if (x < 0 || y < 0 || x >= from.width || y >= from.height) return;
    // The pixel and its neighbors (outside the canvas, they read as
    // transparent), in sRGB, as color settings are.
    const area = from
      .getContext("2d")
      ?.getImageData(x - 1, y - 1, 3, 3, { colorSpace: "srgb" });
    const color = area && colorAt(area, 1, 1);
    if (!color) return;
    session.setParam(key, color);
    session.picking = null;
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
  class:picking={session.picking}
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
  <div
    class="picture checker"
    class:hidden={!real || shown.length === 0}
    style:width="{size.width}px"
    style:height="{size.height}px"
    style:transform={placement}
  >
    <!-- A new canvas when that changes: one drawn by the GPU can't take 2D drawing. -->
    {#key live}
      <canvas
        bind:this={canvas}
        {@attach live && startGpu}
        class:pixels={scale >= 2 && density >= 0.999}
      ></canvas>
    {/key}
    <canvas
      bind:this={detailCanvas}
      class="detail"
      class:hidden={!sharp}
      class:pixels={sharp && scale >= 2 * sharp.density}
      style:left="{(sharp?.region.x ?? 0) * 100}%"
      style:top="{(sharp?.region.y ?? 0) * 100}%"
      style:width="{(sharp?.region.width ?? 0) * 100}%"
      style:height="{(sharp?.region.height ?? 0) * 100}%"
    ></canvas>
  </div>

  {#if op?.id === "margin" && real && shown.length && !session.picking}
    <div
      class="overlay"
      style:width="{size.width}px"
      style:height="{size.height}px"
      style:transform={placement}
    >
      <MarginHandles {scale} onhold={hold} />
    </div>
  {/if}

  {#if error && shown.length}
    <p class="notice error message">{error}</p>
  {/if}

  {#if (busy || detailBusy) && real}<span class="busy hint">Updating…</span
    >{/if}

  {#if session.picking && real && shown.length}
    <div class="pick-hint">
      <span>Tap or click the image to pick the color</span>
      <button
        class="quiet"
        type="button"
        onclick={() => (session.picking = null)}>Cancel</button
      >
    </div>
  {/if}

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
  /*
   * Fitted, a swipe scrolls the page (on a phone the preview scrolls away
   * with it); zoomed in, a drag moves the image instead.
   */
  .stage {
    background: var(--stage);
    height: 100%;
    min-height: 12rem;
    overflow: hidden;
    position: relative;
    touch-action: pan-y;
    user-select: none;
  }

  .stage.zoomed {
    cursor: grab;
    touch-action: none;
  }

  .stage.zoomed:active {
    cursor: grabbing;
  }

  .stage.picking,
  .stage.picking:active {
    cursor: crosshair;
  }

  .picture,
  .overlay {
    left: 50%;
    position: absolute;
    top: 50%;
  }

  .picture {
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  }

  .picture canvas {
    display: block;
    height: 100%;
    width: 100%;
  }

  .picture .detail {
    position: absolute;
  }

  .overlay {
    pointer-events: none;
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

  .pick-hint {
    align-items: center;
    background: var(--sheet);
    border-radius: var(--radius);
    box-shadow: 0 0 0 1px var(--line);
    display: flex;
    gap: 0.5rem;
    left: 50%;
    max-width: calc(100% - 1.5rem);
    padding: 2px 2px 2px 0.75rem;
    position: absolute;
    top: 0.75rem;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .pick-hint button {
    min-height: 2rem;
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
