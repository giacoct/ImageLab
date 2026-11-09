<!--
  Live preview of the chain, rendered by the engine on downscaled copies with
  the same operations the processing uses: the selected image, or all of them
  when the chain merges. It stops before an OCR or SVG step, whose result
  isn't an image.
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

  const item = $derived(session.selected);
  /** The images shown, once they've been read without problems. */
  const shown = $derived(
    session.merges
      ? session.usable.filter((other) => other.info)
      : item?.info
        ? [item]
        : [],
  );
  /** Changes only when the images shown do, not when other details of the list arrive. */
  const ids = $derived(shown.map((other) => other.id).join(" "));
  const finalAt = $derived(session.ops.findIndex((op) => op.kind === "final"));

  // Re-render when the previewed steps' settings or the images shown change.
  $effect(() => {
    const steps = $state.snapshot(
      session.steps.slice(0, finalAt === -1 ? undefined : finalAt),
    );
    if (!ids) {
      ready = false;
      return;
    }
    untrack(() =>
      previewer.request({
        files: shown.map(({ id, file }) => ({ key: id, blob: file })),
        steps,
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
      aria-label="Preview of the result"
    ></canvas>
    {#if !item}
      <p class="muted">Add images to see a preview.</p>
    {:else if shown.length === 0 && item.error}
      <p class="error-text">{item.file.name}: {item.error}</p>
    {:else if shown.length === 0}
      <p class="muted">Reading {item.file.name}…</p>
    {/if}
    {#if busy}<span class="busy hint" aria-live="polite">Rendering…</span>{/if}
  </div>

  {#if error && shown.length}
    <p class="notice error">{error}</p>
  {/if}
  {#if finalAt !== -1 && shown.length}
    <p class="hint">
      The preview stops before <strong>{session.ops[finalAt].title}</strong>,
      which runs when you process the images.
    </p>
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
