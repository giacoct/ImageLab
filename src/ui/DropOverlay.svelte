<!--
  Images can be dropped anywhere on the page: while files are dragged over
  the window, an overlay says so, and dropping adds them to the session.
  Dragging a file in the list to reorder it carries no files, so it's ignored.
-->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';

  import { session } from '../app/session.svelte';
  import Icon from './Icon.svelte';
  import { ms } from './motion';

  let visible = $state(false);
  // dragenter/dragleave fire for every element crossed; count to know when the drag left the window.
  let depth = 0;

  const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
</script>

<svelte:window
  ondragenter={(event) => {
    if (!carriesFiles(event)) return;
    depth += 1;
    visible = true;
  }}
  ondragleave={(event) => {
    if (!carriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) visible = false;
  }}
  ondragover={(event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }}
  ondrop={(event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    visible = false;
    if (event.dataTransfer?.files.length) session.addFiles(event.dataTransfer.files);
  }}
/>

{#if visible}
  <div class="overlay" transition:fade={{ duration: ms(160) }}>
    <div class="target" transition:scale={{ start: 0.96, duration: ms(220) }}>
      <span class="icon"><Icon name="upload" size={30} /></span>
      <strong>Drop to add images</strong>
      <span class="muted">They stay on this device.</span>
    </div>
  </div>
{/if}

<style>
  .overlay {
    backdrop-filter: blur(8px);
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    display: grid;
    inset: 0;
    padding: clamp(0.75rem, 3vw, 2rem);
    pointer-events: none;
    position: fixed;
    z-index: 100;
  }

  /* The whole window becomes the canvas. */
  .target {
    align-content: center;
    background: color-mix(in srgb, var(--accent-soft) 75%, transparent);
    border: 2px dashed var(--accent);
    border-radius: 32px;
    display: grid;
    gap: 0.4rem;
    justify-items: center;
    text-align: center;
  }

  .icon {
    align-items: center;
    animation: bob 1.2s var(--ease) infinite alternate;
    background: var(--accent);
    border-radius: 50%;
    box-shadow: 0 14px 30px -12px var(--accent);
    color: var(--on-accent);
    display: flex;
    height: 4.25rem;
    justify-content: center;
    margin-bottom: 0.75rem;
    width: 4.25rem;
  }

  strong {
    font-size: clamp(1.6rem, 3vw, 2.4rem);
    font-weight: 620;
    letter-spacing: -0.035em;
  }

  @keyframes bob {
    to {
      transform: translateY(-8px);
    }
  }
</style>
