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
      <div class="placeholder">
        <span class="frames" aria-hidden="true">
          <span></span><span></span><span><Icon name="image" size={28} /></span>
        </span>
        <strong>Your live preview shows up here</strong>
        <span class="muted">Add images on the left, or drop them anywhere on the page.</span>
      </div>
    {/if}
    {#if busy}
      <span class="busy" aria-live="polite"><span class="spinner"></span>Rendering</span>
    {/if}
  </div>

  {#if error}
    <p class="notice error">{error}</p>
  {:else if stoppedAt !== -1 && files.list.length}
    <p class="hint">
      <Icon name="info" size={14} />
      The preview stops before <strong>{session.ops[stoppedAt].title}</strong>, which runs when you
      process the images.
    </p>
  {/if}
  {#if pickStep !== -1 && files.list.length}
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

  .stage {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) + 0.25rem);
    box-shadow:
      var(--shadow),
      inset 0 0 0 4px var(--panel);
    display: flex;
    justify-content: center;
    min-height: 20rem;
    overflow: hidden;
    padding: 1rem;
    position: relative;
  }

  canvas {
    animation: appear 300ms var(--ease);
    border-radius: 2px;
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--ink) 10%, transparent),
      0 12px 32px -12px var(--shadow-color);
    max-height: 70vh;
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
    background: color-mix(in oklch, var(--panel) 85%, transparent);
    border-radius: var(--radius);
    display: grid;
    gap: 0.3rem;
    justify-items: center;
    max-width: 22rem;
    padding: 1.5rem;
    text-align: center;
  }

  .placeholder strong {
    font-family: var(--font-display);
    font-size: 1.1rem;
  }

  /* Three little frames, fanned out; they straighten up on hover. */
  .frames {
    display: grid;
    height: 4.5rem;
    margin-bottom: 0.6rem;
    place-items: center;
    width: 5.5rem;
  }

  .frames span {
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--border-strong);
    border-radius: 0.7rem;
    box-shadow: var(--shadow-sm);
    display: flex;
    grid-area: 1 / 1;
    height: 3.8rem;
    justify-content: center;
    transition: transform 500ms var(--spring);
    width: 4.6rem;
  }

  .frames span:nth-child(1) {
    background: light-dark(oklch(0.94 0.04 40), oklch(0.32 0.05 40));
    transform: rotate(-12deg) translateX(-8px);
  }

  .frames span:nth-child(2) {
    background: light-dark(oklch(0.94 0.04 290), oklch(0.32 0.05 290));
    transform: rotate(9deg) translateX(8px);
  }

  .frames span:nth-child(3) {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .placeholder:hover .frames span:nth-child(1) {
    transform: rotate(-18deg) translate(-14px, -2px);
  }

  .placeholder:hover .frames span:nth-child(2) {
    transform: rotate(15deg) translate(14px, -2px);
  }

  .placeholder:hover .frames span:nth-child(3) {
    transform: translateY(-4px);
  }

  .busy {
    align-items: center;
    animation: rise 200ms var(--ease);
    backdrop-filter: blur(8px);
    background: color-mix(in oklch, var(--panel) 85%, transparent);
    border: 1px solid var(--border);
    border-radius: 999px;
    box-shadow: var(--shadow);
    color: var(--accent-strong);
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

  .pick :global(svg) {
    color: var(--accent);
  }

  .metadata {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    font-size: 0.85rem;
    padding: 0.7rem 1rem;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
  }

  summary::marker {
    color: var(--accent);
  }

  .metadata[open] dl {
    animation: rise 260ms var(--ease);
  }

  dl {
    display: grid;
    gap: 0.3rem 1rem;
    grid-template-columns: max-content 1fr;
    margin: 0.7rem 0 0.2rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
