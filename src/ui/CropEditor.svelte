<!--
  Interactive crop box for "Rotate, flip & crop", filling the stage: the
  picked image rotated/flipped but uncropped, with a box to drag and
  handles. The crop is stored as fractions, so it applies to every image.
-->
<script lang="ts">
  import { drawBitmap, Previewer } from "../app/previewer";
  import { session } from "../app/session.svelte";
  import {
    applyDrag,
    aspectFactor,
    centeredCrop,
    FULL_CROP,
    type AspectPreset,
    type Crop,
    type DragMode,
  } from "../core/geometry";
  import { cropForImage } from "../ops/transform";

  let canvas = $state<HTMLCanvasElement>();
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  /** Size of the rendered image (only its ratio matters). */
  let size = $state<{ width: number; height: number } | null>(null);

  const previewer = new Previewer(
    ({ bitmap }) => {
      size = { width: bitmap.width, height: bitmap.height };
      if (canvas) drawBitmap(canvas, bitmap);
      else bitmap.close();
    },
    () => (size = null),
  );

  const params = $derived(session.tool?.params ?? {});
  const aspect = $derived((params.aspect ?? "free") as AspectPreset);
  const crop = $derived((params.crop ?? FULL_CROP) as Crop);
  const k = $derived(size ? aspectFactor(aspect, size) : null);
  const shown = $derived(size ? cropForImage(crop, aspect, size) : crop);

  /** Room around the image, and for the bar at the bottom. */
  const PADDING = 32;
  const BAR = 56;
  const display = $derived.by(() => {
    if (!size || !stageWidth) return { width: 0, height: 0 };
    const fit = Math.min(
      (stageWidth - PADDING * 2) / size.width,
      (stageHeight - PADDING - BAR) / size.height,
    );
    return { width: size.width * fit, height: size.height * fit };
  });

  // The image rotated/flipped but not cropped. Only what changes that image
  // is read, so dragging the crop box doesn't re-render it.
  $effect(() => {
    const item = session.selected;
    if (!item) return;
    const { rotate, flipH, flipV } = params;
    const longest = Math.max(stageWidth, stageHeight, 320);
    previewer.request({
      images: [{ key: item.id, version: item.version }],
      action: {
        op: "transform",
        params: { rotate, flipH, flipV, crop: FULL_CROP, aspect: "free" },
      },
      maxSide: Math.round(longest * devicePixelRatio),
    });
  });

  let drag: {
    mode: DragMode;
    x: number;
    y: number;
    start: Crop;
    rect: DOMRect;
  } | null = null;

  function start(event: PointerEvent, mode: DragMode): void {
    if (!canvas) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag = {
      mode,
      x: event.clientX,
      y: event.clientY,
      start: shown,
      rect: canvas.getBoundingClientRect(),
    };
  }

  function move(event: PointerEvent): void {
    if (!drag) return;
    const dx = (event.clientX - drag.x) / drag.rect.width;
    const dy = (event.clientY - drag.y) / drag.rect.height;
    session.setParam("crop", applyDrag(drag.start, drag.mode, dx, dy, k));
  }

  function end(): void {
    drag = null;
  }

  const HANDLES: DragMode[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const percent = (n: number) => `${(n * 100).toFixed(3)}%`;
</script>

<div
  class="editor"
  bind:clientWidth={stageWidth}
  bind:clientHeight={stageHeight}
>
  <div
    class="frame checker"
    class:hidden={!size}
    style:width="{display.width}px"
    style:height="{display.height}px"
  >
    <canvas bind:this={canvas} aria-label="Image to crop"></canvas>
    {#if size}
      <div
        class="box"
        style:left={percent(shown.x)}
        style:top={percent(shown.y)}
        style:width={percent(shown.width)}
        style:height={percent(shown.height)}
        role="presentation"
        onpointerdown={(event) => start(event, "move")}
        onpointermove={move}
        onpointerup={end}
        onpointercancel={end}
      >
        {#each HANDLES as handle (handle)}
          <span
            class="handle {handle}"
            role="presentation"
            onpointerdown={(event) => start(event, handle)}
            onpointermove={move}
            onpointerup={end}
            onpointercancel={end}
          ></span>
        {/each}
      </div>
    {/if}
  </div>
  <div class="bar">
    <span class="hint numbers">
      {#if size}
        {Math.round(shown.width * 100)}% × {Math.round(shown.height * 100)}% of
        the image
      {/if}
    </span>
    <button
      class="quiet"
      type="button"
      onclick={() => session.setParam("crop", centeredCrop(k))}
    >
      Reset crop
    </button>
  </div>
</div>

<style>
  .editor {
    background: var(--stage);
    height: 100%;
    min-height: 12rem;
    position: relative;
  }

  .frame {
    left: 50%;
    overflow: hidden; /* clips the dimming shadow around the crop box */
    position: absolute;
    top: calc(50% - 28px);
    touch-action: none;
    transform: translate(-50%, -50%);
    user-select: none;
  }

  .hidden {
    visibility: hidden;
  }

  canvas {
    display: block;
    height: 100%;
    width: 100%;
  }

  /* Dashed thirds inside the crop box help with composition. */
  .box {
    background:
      linear-gradient(
        to right,
        transparent calc(100% / 3 - 0.5px),
        rgb(255 255 255 / 0.45) 0,
        rgb(255 255 255 / 0.45) calc(100% / 3 + 0.5px),
        transparent 0,
        transparent calc(200% / 3 - 0.5px),
        rgb(255 255 255 / 0.45) 0,
        rgb(255 255 255 / 0.45) calc(200% / 3 + 0.5px),
        transparent 0
      ),
      linear-gradient(
        to bottom,
        transparent calc(100% / 3 - 0.5px),
        rgb(255 255 255 / 0.45) 0,
        rgb(255 255 255 / 0.45) calc(100% / 3 + 0.5px),
        transparent 0,
        transparent calc(200% / 3 - 0.5px),
        rgb(255 255 255 / 0.45) 0,
        rgb(255 255 255 / 0.45) calc(200% / 3 + 0.5px),
        transparent 0
      );
    border: 2px solid #fff;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.5),
      0 0 0 9999px rgb(0 0 0 / 0.45);
    cursor: move;
    position: absolute;
  }

  .handle {
    background: #fff;
    border: 2px solid var(--accent);
    border-radius: 50%;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
    height: 14px;
    position: absolute;
    width: 14px;
  }

  .nw,
  .ne,
  .sw,
  .se {
    height: 16px;
    width: 16px;
  }

  .n,
  .s {
    cursor: ns-resize;
    left: calc(50% - 7px);
  }
  .e,
  .w {
    cursor: ew-resize;
    top: calc(50% - 7px);
  }
  .n {
    top: -2px;
  }
  .s {
    bottom: -2px;
  }
  .e {
    right: -2px;
  }
  .w {
    left: -2px;
  }
  .nw {
    cursor: nwse-resize;
    left: -2px;
    top: -2px;
  }
  .ne {
    cursor: nesw-resize;
    right: -2px;
    top: -2px;
  }
  .sw {
    bottom: -2px;
    cursor: nesw-resize;
    left: -2px;
  }
  .se {
    bottom: -2px;
    cursor: nwse-resize;
    right: -2px;
  }

  .bar {
    align-items: center;
    bottom: 0;
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    left: 0;
    min-height: 56px;
    position: absolute;
    right: 0;
  }
</style>
