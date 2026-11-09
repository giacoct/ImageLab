<!--
  Live preview, rendered by the engine on downscaled copies with the same
  operations the tools apply: the open tool on the selected image (on all of
  them for a merge), or the image as it is when no tool is open. Extract
  text and Convert to SVG show the image they'll read.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { drawBitmap, Previewer } from "../app/previewer";
  import { session } from "../app/session.svelte";

  let canvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let error = $state("");
  let busy = $state(false);
  let ready = $state(false);

  const previewer = new Previewer(
    (bitmap) => {
      drawBitmap(canvas, bitmap);
      error = "";
      ready = true;
    },
    (message) => (error = message),
    (value) => (busy = value),
  );

  const op = $derived(session.op);
  const shown = $derived(
    op?.kind === "combine"
      ? session.items
      : session.selected
        ? [session.selected]
        : [],
  );

  // Re-render when the tool, its settings or the images shown change.
  $effect(() => {
    const action =
      session.tool && op?.kind !== "final"
        ? $state.snapshot(session.tool)
        : null;
    if (shown.length === 0) {
      ready = false;
      return;
    }
    const images = shown.map(({ id, version }) => ({ key: id, version }));
    untrack(() =>
      previewer.request({
        images,
        action,
        maxSide: Math.round((stage?.clientWidth || 800) * devicePixelRatio),
      }),
    );
  });
</script>

<div class="preview">
  <div class="stage checker" bind:this={stage}>
    <canvas
      bind:this={canvas}
      class:hidden={!ready || shown.length === 0}
      aria-label={op ? `Preview of ${op.title}` : "The selected image"}
    ></canvas>
    {#if shown.length === 0}
      <p class="muted">
        {session.reading ? "Reading images…" : "Add images to see them here."}
      </p>
    {/if}
    {#if busy}<span class="busy hint" aria-live="polite">Rendering…</span>{/if}
  </div>

  {#if error && shown.length}
    <p class="notice error">{error}</p>
  {/if}
</div>

<style>
  .preview {
    display: grid;
    gap: 0.5rem;
  }

  .stage {
    align-items: center;
    border: 1px solid var(--border);
    display: flex;
    justify-content: center;
    min-height: 16rem;
    padding: 0.5rem;
    position: relative;
  }

  canvas {
    max-height: 75vh;
    max-width: 100%;
    object-fit: contain;
  }

  .hidden {
    display: none;
  }

  .busy {
    background: var(--bg);
    padding: 0.1rem 0.4rem;
    position: absolute;
    right: 0.4rem;
    top: 0.4rem;
  }
</style>
