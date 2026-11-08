<!--
  Live preview of the selected image through the chain, rendered by the
  engine on a downscaled copy with the same operations the processing uses.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import { drawBitmap, Previewer } from '../app/previewer';
  import { session } from '../app/session.svelte';

  let canvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let error = $state('');
  let busy = $state(false);
  let ready = $state(false);

  const previewer = new Previewer(
    (bitmap) => {
      drawBitmap(canvas, bitmap);
      error = '';
      ready = true;
    },
    (message) => (error = message),
    (value) => (busy = value),
  );

  const item = $derived(session.selected);
  /** Previewable once the file has been read without problems. */
  const file = $derived(item?.info ? item.file : undefined);
  const key = $derived(item?.id);

  // Re-render when the steps' settings or the file shown change.
  $effect(() => {
    const steps = $state.snapshot(session.steps);
    if (!file || !key) {
      ready = false;
      return;
    }
    untrack(() =>
      previewer.request({
        key,
        blob: file,
        steps,
        maxSide: Math.round((stage?.clientWidth || 800) * devicePixelRatio),
      }),
    );
  });
</script>

<div class="preview">
  <div class="stage checker" bind:this={stage}>
    <canvas bind:this={canvas} class:hidden={!ready || !file} aria-label="Preview of the result"
    ></canvas>
    {#if !item}
      <p class="muted">Add images to see a preview.</p>
    {:else if item.error}
      <p class="error-text">{item.file.name}: {item.error}</p>
    {:else if !item.info}
      <p class="muted">Reading {item.file.name}…</p>
    {/if}
    {#if busy}<span class="busy hint" aria-live="polite">Rendering…</span>{/if}
  </div>

  {#if error && file}
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
