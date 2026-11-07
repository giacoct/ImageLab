<!--
  Interactive crop box for the "Rotate, flip & crop" step: shows the selected
  image as it enters the step (rotated/flipped, uncropped) with a draggable
  box and handles. The crop is stored as fractions, so it applies to every
  image in the batch.
-->
<script lang="ts">
  import { drawBitmap, Previewer } from '../app/previewer';
  import { session } from '../app/session.svelte';
  import {
    applyDrag,
    aspectFactor,
    centeredCrop,
    FULL_CROP,
    type AspectPreset,
    type Crop,
    type DragMode,
  } from '../core/geometry';
  import type { Step } from '../core/recipe';
  import { cropForImage } from '../ops/transform';

  let { index }: { index: number } = $props();

  let canvas: HTMLCanvasElement;
  let size = $state<{ width: number; height: number } | null>(null);

  const previewer = new Previewer(
    (bitmap) => {
      size = { width: bitmap.width, height: bitmap.height };
      drawBitmap(canvas, bitmap);
    },
    () => (size = null),
  );

  const params = $derived(session.steps[index]?.params ?? {});
  const aspect = $derived((params.aspect ?? 'free') as AspectPreset);
  const crop = $derived((params.crop ?? FULL_CROP) as Crop);
  const k = $derived(size ? aspectFactor(aspect, size) : null);
  const shown = $derived(size ? cropForImage(crop, aspect, size) : crop);

  // The image entering this step, rotated/flipped but not cropped.
  $effect(() => {
    const item = session.selectedItem;
    if (!item?.info) return;
    const steps = $state.snapshot(session.steps.slice(0, index + 1)) as Step[];
    const self = steps[index];
    self.params = { ...self.params, crop: FULL_CROP, aspect: 'free' };
    previewer.request({
      files: [{ key: item.id, blob: item.file }],
      selected: 0,
      steps,
      maxSide: 900,
    });
  });

  // Choosing a ratio starts from the largest centered crop of that ratio.
  let lastAspect: AspectPreset | undefined;
  $effect(() => {
    const current = aspect;
    const factor = k;
    if (!size) return;
    if (lastAspect !== undefined && lastAspect !== current) {
      session.setParam(index, 'crop', centeredCrop(factor));
    }
    lastAspect = current;
  });

  let drag: { mode: DragMode; x: number; y: number; start: Crop; rect: DOMRect } | null = null;

  function start(event: PointerEvent, mode: DragMode): void {
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
    session.setParam(index, 'crop', applyDrag(drag.start, drag.mode, dx, dy, k));
  }

  function end(): void {
    drag = null;
  }

  const HANDLES: DragMode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const percent = (n: number) => `${(n * 100).toFixed(3)}%`;
</script>

<div class="editor">
  <div class="frame checker">
    <canvas bind:this={canvas} aria-label="Image to crop"></canvas>
    {#if size}
      <div
        class="box"
        style:left={percent(shown.x)}
        style:top={percent(shown.y)}
        style:width={percent(shown.width)}
        style:height={percent(shown.height)}
        role="presentation"
        onpointerdown={(event) => start(event, 'move')}
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
  <div class="row">
    <span class="hint">
      {#if size}
        Crop: {Math.round(shown.width * 100)}% × {Math.round(shown.height * 100)}% of the image
      {/if}
    </span>
    <button
      class="button small"
      type="button"
      onclick={() => session.setParam(index, 'crop', centeredCrop(k))}
    >
      Reset crop
    </button>
  </div>
</div>

<style>
  .editor {
    display: grid;
    gap: 0.5rem;
  }

  .frame {
    border-radius: 0.5rem;
    justify-self: center;
    line-height: 0;
    overflow: hidden; /* clips the dimming shadow around the crop box */
    position: relative;
    touch-action: none;
    user-select: none;
  }

  canvas {
    max-height: 22rem;
    max-width: 100%;
  }

  .box {
    border: 2px solid #fff;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.5),
      0 0 0 9999px rgb(0 0 0 / 0.45);
    cursor: move;
    position: absolute;
  }

  .handle {
    background: #fff;
    border: 1px solid rgb(0 0 0 / 0.5);
    border-radius: 2px;
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

  .row {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }
</style>
