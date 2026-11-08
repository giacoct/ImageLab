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
  import Icon from './Icon.svelte';

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
  <div class="stage canvas" bind:this={stage} class:empty={!ready}>
    <!-- Color picking is a mouse/touch convenience; the color field is the accessible way. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <canvas
      bind:this={canvas}
      class="checker"
      class:picking={pickStep !== -1}
      class:hidden={!ready || files.length === 0}
      onclick={pick}
      aria-label="Preview of the result"
    ></canvas>
    {#if files.length === 0}
      <div class="placeholder">
        <span class="frame" aria-hidden="true"><Icon name="image" size={26} /></span>
        <strong>The live preview shows up here</strong>
        <span class="muted">Add images on the left, or drop them anywhere on the page.</span>
      </div>
    {/if}
    {#if busy}
      <span class="busy" aria-live="polite"><span class="spinner"></span>Rendering</span>
    {/if}
  </div>

  {#if error}
    <p class="notice error">{error}</p>
  {:else if stoppedAt !== -1 && files.length}
    <p class="hint">
      <Icon name="info" size={14} />
      The preview stops before <strong>{session.ops[stoppedAt].title}</strong>, which runs when you
      process the images.
    </p>
  {/if}
  {#if pickStep !== -1 && files.length}
    <p class="hint pick">
      <Icon name="pipette" size={14} /> Click the preview to pick the background color.
    </p>
  {/if}

  {#if session.selectedItem?.info && !session.merges}
    {@const { metadata } = session.selectedItem.info}
    <details class="metadata" open={session.exportSettings.format === 'keep'}>
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
    gap: 0.7rem;
  }

  /* The canvas: a neutral dot grid, as in design tools, so it doesn't tint the image. */
  .stage {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    justify-content: center;
    min-height: 22rem;
    overflow: hidden;
    padding: clamp(1rem, 3vw, 2.25rem);
    position: relative;
  }

  canvas {
    animation: appear 300ms var(--ease);
    border-radius: 3px;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.06),
      0 24px 48px -20px rgb(20 20 40 / 0.45);
    max-height: 72vh;
    max-width: 100%;
    object-fit: contain;
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: scale(0.985);
    }
  }

  canvas.picking {
    cursor: crosshair;
  }

  .hidden {
    display: none;
  }

  .placeholder {
    display: grid;
    gap: 0.35rem;
    justify-items: center;
    max-width: 22rem;
    padding: 1.5rem;
    text-align: center;
  }

  .placeholder strong {
    font-size: 1.1rem;
    font-weight: 620;
    letter-spacing: -0.02em;
  }

  /* An empty frame waiting for a picture. */
  .frame {
    align-items: center;
    background: var(--panel);
    border: 1.5px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--soft);
    display: flex;
    height: 5rem;
    justify-content: center;
    margin-bottom: 0.75rem;
    transition: transform 500ms var(--spring);
    width: 6.5rem;
  }

  .placeholder:hover .frame {
    transform: translateY(-3px) rotate(-2deg);
  }

  .busy {
    align-items: center;
    animation: rise 200ms var(--ease);
    backdrop-filter: blur(8px);
    background: color-mix(in srgb, var(--panel) 85%, transparent);
    border-radius: 999px;
    box-shadow: var(--shadow);
    display: flex;
    font-size: 0.75rem;
    font-weight: 600;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    position: absolute;
    right: 0.8rem;
    top: 0.8rem;
  }

  .hint {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  /* A quiet disclosure under the stage, not another box. */
  .metadata {
    font-size: 0.85rem;
    padding: 0 0.25rem;
  }

  summary {
    color: var(--muted);
    cursor: pointer;
    font-weight: 600;
    width: fit-content;
  }

  summary:hover {
    color: var(--ink);
  }

  summary::marker {
    color: var(--soft);
  }

  .metadata[open] {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
  }

  .metadata[open] dl {
    animation: rise 260ms var(--ease);
  }

  dl {
    display: grid;
    gap: 0.35rem 1.25rem;
    grid-template-columns: max-content 1fr;
    margin: 0.75rem 0 0.2rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
