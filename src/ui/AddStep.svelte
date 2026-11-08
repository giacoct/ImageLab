<!--
  "Add a step" menu: every operation that can still be added to the recipe.
  Closes on a choice, a click elsewhere, or Escape.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import Icon from './Icon.svelte';
  import Tile from './Tile.svelte';
  import { ART } from './ToolArt.svelte';
  import ToolArt from './ToolArt.svelte';

  let menu: HTMLDetailsElement;

  function add(opId: string): void {
    session.addStep(opId);
    menu.open = false;
  }
</script>

<svelte:window
  onclick={(event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape' && menu.open) menu.open = false;
  }}
/>

<details class="add" bind:this={menu}>
  <summary>
    <span class="slot" aria-hidden="true"
      ><span class="plus"><Icon name="plus" size={16} /></span></span
    >
    Add a step
  </summary>
  <ul>
    {#each session.availableOps() as op (op.id)}
      <li>
        <button type="button" onclick={() => add(op.id)}>
          {#if ART.has(op.icon)}
            <span class="thumb"><ToolArt icon={op.icon} /></span>
          {:else}
            <Tile icon={op.icon} />
          {/if}
          <span>
            <strong>{op.title}</strong>
            <span class="hint">{op.description}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
</details>

<style>
  /* Sits on the process sheet's rail like a section: an open slot for a step. */
  .add {
    padding: 0.35rem 0 0.35rem 2.85rem;
    position: relative;
  }

  summary {
    align-items: center;
    border: 1px dashed var(--border-strong);
    border-radius: 999px;
    color: var(--muted);
    cursor: pointer;
    display: flex;
    font-size: 0.9rem;
    font-weight: 600;
    list-style: none;
    min-height: 2.6rem;
    padding: 0.3rem 0.9rem;
    transition:
      border-color 160ms var(--ease),
      color 160ms var(--ease),
      background 160ms var(--ease);
  }

  summary:hover,
  .add[open] summary {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .slot {
    align-items: center;
    background: var(--panel);
    border: 1.5px dashed var(--border-strong);
    border-radius: 9px;
    color: var(--muted);
    display: flex;
    height: 2rem;
    justify-content: center;
    left: 0;
    position: absolute;
    transition:
      border-color 160ms var(--ease),
      color 160ms var(--ease);
    width: 2rem;
  }

  summary:hover .slot,
  .add[open] .slot {
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .plus {
    display: flex;
    transition: transform 300ms var(--spring);
  }

  summary:hover .plus {
    transform: rotate(90deg);
  }

  .add[open] .plus {
    transform: rotate(45deg);
  }

  ul {
    animation: menu-in 220ms var(--ease);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    display: grid;
    gap: 0.1rem;
    left: 0;
    list-style: none;
    margin: 0.4rem 0 0;
    max-height: min(28rem, 70vh);
    overflow-y: auto;
    padding: 0.35rem;
    position: absolute;
    right: 0;
    transform-origin: top center;
    z-index: 10;
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.98);
    }
  }

  li button {
    align-items: center;
    background: none;
    border: 0;
    border-radius: var(--radius-sm);
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem 0.6rem;
    text-align: left;
    transition: background 140ms var(--ease);
    width: 100%;
  }

  li button:hover {
    background: var(--hover);
  }

  /* Each step shows its tool's illustration, as in the navigation's Tools menu. */
  .thumb {
    border-radius: 9px;
    box-shadow: 0 0 0 1px var(--border);
    flex: none;
    height: 2.6rem;
    overflow: hidden;
    width: 4rem;
  }

  li button .thumb,
  li button :global(.tile) {
    transition: transform 300ms var(--spring);
  }

  li button:hover .thumb,
  li button:hover :global(.tile) {
    transform: scale(1.05) rotate(-2deg);
  }

  li span {
    display: grid;
  }

  strong {
    font-size: 0.9rem;
  }
</style>
