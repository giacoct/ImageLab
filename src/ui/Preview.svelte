<!--
  Live preview of the selected image through the recipe's steps, rendered by
  the engine on a downscaled copy with the same operations the export uses.
  Slow (ML) steps are left out. Clicking picks a color when a step asks for
  one (e.g. the background to remove).
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import { drawBitmap, Previewer } from '../app/previewer';
  import { session, type Item } from '../app/session.svelte';
  import type { Step } from '../core/recipe';
  import { engine } from '../engine/client';
  import type { PreviewRequest } from '../engine/pipeline';
  import { stopsPreview } from '../ops/op';

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

  /** The files shown: the selected one, or all of them for a merge (once they've been read). */
  const files = $derived<Item[]>(
    session.merges
      ? session.items.filter((item) => item.info)
      : session.selectedItem?.info
        ? [session.selectedItem]
        : [],
  );
  /** Changes only when the files shown do, not when other details of the list arrive. */
  const fileIds = $derived(files.map((item) => item.id).join(' '));

  /** The first step the preview leaves out (slow or non-image), or -1. */
  const stoppedAt = $derived(session.ops.findIndex(stopsPreview));
  const previewedSteps = $derived(stoppedAt === -1 ? session.steps.length : stoppedAt);

  /** The step whose color setting a click on the preview sets, or -1. */
  const pickStep = $derived(
    session.ops.findIndex(
      (op, index) => index < previewedSteps && op.kind === 'map' && op.pickColor !== undefined,
    ),
  );

  function request(steps: Step[]): PreviewRequest {
    return {
      files: files.map((item) => ({ key: item.id, blob: item.file })),
      selected: 0,
      steps,
      maxSide: Math.round((stage?.clientWidth || 800) * devicePixelRatio),
    };
  }

  // Re-render when the previewed steps' settings or the files shown change;
  // settings of steps the preview leaves out don't matter.
  $effect(() => {
    const steps = $state.snapshot(session.steps.slice(0, previewedSteps));
    if (!fileIds) {
      ready = false;
      return;
    }
    untrack(() => previewer.request(request(steps)));
  });

  async function pick(event: MouseEvent): Promise<void> {
    const op = session.ops[pickStep];
    if (op?.kind !== 'map' || !op.pickColor) return;
    const rect = canvas.getBoundingClientRect();
    const { color } = await engine.preview('sample', {
      ...request($state.snapshot(session.steps.slice(0, pickStep))),
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
    session.setParam(pickStep, op.pickColor, color);
  }
</script>

<div class="preview">
  <div class="stage checker" bind:this={stage}>
    <!-- Color picking is a mouse/touch convenience; the color field is the accessible way. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <canvas
      bind:this={canvas}
      class:picking={pickStep !== -1}
      class:hidden={!ready || files.length === 0}
      onclick={pick}
      aria-label="Preview of the result"
    ></canvas>
    {#if files.length === 0}
      <p class="muted">Add images to see a preview.</p>
    {/if}
    {#if busy}<span class="busy hint" aria-live="polite">Rendering…</span>{/if}
  </div>

  {#if error}
    <p class="notice error">{error}</p>
  {:else if stoppedAt !== -1 && files.length}
    <p class="hint">
      The preview stops before <strong>{session.ops[stoppedAt].title}</strong>, which runs when you
      process the images.
    </p>
  {/if}
  {#if pickStep !== -1 && files.length}
    <p class="hint">Click the preview to pick the background color.</p>
  {/if}

  {#if session.selectedItem?.info && !session.merges}
    {@const { metadata } = session.selectedItem.info}
    <details open={session.steps.some((step) => step.op === 'strip-metadata')}>
      <summary>Metadata in {session.selectedItem.file.name}</summary>
      {#if metadata.entries.length}
        <dl>
          {#each metadata.entries as entry (entry.label)}
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          {/each}
        </dl>
      {:else}
        <p class="hint">No metadata found.</p>
      {/if}
    </details>
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

  canvas.picking {
    cursor: crosshair;
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

  details {
    font-size: 0.9rem;
  }

  summary {
    cursor: pointer;
  }

  dl {
    display: grid;
    gap: 0.2rem 1rem;
    grid-template-columns: max-content 1fr;
    margin: 0.5rem 0 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
