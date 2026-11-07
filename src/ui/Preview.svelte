<!--
  Live preview of the selected image through the recipe's steps, rendered by
  the engine on a downscaled copy with the same operations the export uses.
  Slow (ML) steps are left out. Clicking picks a color when a step asks for
  one (e.g. the background to remove).
-->
<script lang="ts">
  import { drawBitmap, Previewer } from '../app/previewer';
  import { session } from '../app/session.svelte';
  import { engine } from '../engine/client';
  import { getOp } from '../ops';
  import { isTerminal } from '../ops/op';
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

  /** The files a preview needs: just the selected one, or all of them for a merge. */
  const files = $derived.by(() => {
    const usable = session.items.filter((item) => item.info);
    const chosen = session.selectedItem;
    if (session.merges) return { list: usable, selected: 0 };
    return chosen?.info ? { list: [chosen], selected: 0 } : { list: [], selected: 0 };
  });

  /** The first step the preview leaves out (slow or non-image), if any. */
  const stoppedAt = $derived(session.ops.findIndex((op) => op.heavy || isTerminal(op)));

  /** The step whose color setting a click on the preview sets. */
  const pickStep = $derived(
    session.steps.findIndex(
      (step, index) =>
        (stoppedAt === -1 || index < stoppedAt) &&
        getOp(step.op).kind === 'map' &&
        'pickColor' in getOp(step.op),
    ),
  );

  $effect(() => {
    const steps = $state.snapshot(session.steps);
    const list = files.list.map((item) => ({ key: item.id, blob: item.file }));
    if (list.length === 0) {
      ready = false;
      return;
    }
    const maxSide = Math.min(1600, Math.round((stage?.clientWidth || 800) * devicePixelRatio));
    previewer.request({ files: list, selected: files.selected, steps, maxSide });
  });

  async function pick(event: MouseEvent): Promise<void> {
    if (pickStep === -1) return;
    const op = getOp(session.steps[pickStep].op);
    if (op.kind !== 'map' || !op.pickColor) return;
    const rect = canvas.getBoundingClientRect();
    const { color } = await engine.preview('sample', {
      files: files.list.map((item) => ({ key: item.id, blob: item.file })),
      selected: files.selected,
      steps: $state.snapshot(session.steps.slice(0, pickStep)),
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
    session.setParam(pickStep, op.pickColor, color);
  }
</script>

<div class="preview">
  <div class="stage checker" bind:this={stage} class:empty={!ready}>
    <!-- Color picking is a mouse/touch convenience; the color field is the accessible way. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <canvas
      bind:this={canvas}
      class:picking={pickStep !== -1}
      class:hidden={!ready || files.list.length === 0}
      onclick={pick}
      aria-label="Preview of the result"
    ></canvas>
    {#if files.list.length === 0}
      <p class="placeholder muted"><Icon name="image" size={32} />The preview appears here.</p>
    {/if}
    {#if busy}<span class="busy" aria-live="polite">Rendering…</span>{/if}
  </div>

  {#if error}
    <p class="notice error">{error}</p>
  {:else if stoppedAt !== -1 && files.list.length}
    <p class="hint">
      <Icon name="info" size={13} />
      The preview stops before <strong>{session.ops[stoppedAt].title}</strong>, which runs when you
      process the images.
    </p>
  {/if}
  {#if pickStep !== -1 && files.list.length}
    <p class="hint">
      <Icon name="pipette" size={13} /> Click the preview to pick the background color.
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
    gap: 0.6rem;
  }

  .stage {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    justify-content: center;
    min-height: 18rem;
    overflow: hidden;
    padding: 0.75rem;
    position: relative;
  }

  canvas {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
    max-height: 70vh;
    max-width: 100%;
    object-fit: contain;
  }

  canvas.picking {
    cursor: crosshair;
  }

  .hidden {
    display: none;
  }

  .placeholder {
    align-items: center;
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }

  .busy {
    background: var(--panel);
    border-radius: 999px;
    box-shadow: var(--shadow);
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    position: absolute;
    right: 0.6rem;
    top: 0.6rem;
  }

  .hint {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .metadata {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.85rem;
    padding: 0.6rem 0.9rem;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
  }

  dl {
    display: grid;
    gap: 0.25rem 1rem;
    grid-template-columns: max-content 1fr;
    margin: 0.6rem 0 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
