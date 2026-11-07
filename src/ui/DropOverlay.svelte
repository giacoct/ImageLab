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
      <span class="icon"><Icon name="upload" size={34} /></span>
      <strong>Drop to add images</strong>
      <span class="muted">They stay on this device.</span>
    </div>
  </div>
{/if}

<style>
  .overlay {
    backdrop-filter: blur(6px);
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    display: grid;
    inset: 0;
    padding: 1rem;
    pointer-events: none;
    position: fixed;
    z-index: 100;
  }

  .target {
    align-content: center;
    background: color-mix(in srgb, var(--accent-soft) 70%, transparent);
    border: 2px dashed var(--accent);
    border-radius: 1.5rem;
    display: grid;
    gap: 0.35rem;
    justify-items: center;
    text-align: center;
  }

  .icon {
    animation: bob 1.2s var(--ease) infinite alternate;
    color: var(--accent);
    margin-bottom: 0.4rem;
  }

  strong {
    font-family: var(--font-display);
    font-size: 1.5rem;
  }

  @keyframes bob {
    to {
      transform: translateY(-8px);
    }
  }
</style>
