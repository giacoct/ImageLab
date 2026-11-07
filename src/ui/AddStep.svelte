<!--
  "Add a step" menu: every operation that can still be added to the recipe.
  Closes on a choice, a click elsewhere, or Escape.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import Icon from './Icon.svelte';
  import Tile from './Tile.svelte';

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
  <summary class="button"><span class="plus"><Icon name="plus" /></span>Add a step</summary>
  <ul>
    {#each session.availableOps() as op, index (op.id)}
      <li style:--i={index}>
        <button type="button" onclick={() => add(op.id)}>
          <Tile icon={op.icon} small />
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
  .add {
    position: relative;
  }

  summary {
    background: color-mix(in srgb, var(--panel) 60%, transparent);
    border-style: dashed;
    box-shadow: none;
    color: var(--muted);
    list-style: none;
    min-height: 2.75rem;
    width: 100%;
  }

  summary:hover,
  .add[open] summary {
    color: var(--accent-strong);
  }

  summary::-webkit-details-marker {
    display: none;
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

  li {
    animation: rise 260ms var(--ease) both;
    animation-delay: calc(var(--i) * 20ms);
  }

  li button {
    align-items: center;
    background: none;
    border: 0;
    border-radius: 0.65rem;
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem 0.6rem;
    text-align: left;
    transition: background 140ms var(--ease);
    width: 100%;
  }

  li button:hover {
    background: var(--panel-subtle);
  }

  li button :global(.tile) {
    transition: transform 300ms var(--spring);
  }

  li button:hover :global(.tile) {
    transform: scale(1.1) rotate(-6deg);
  }

  li span {
    display: grid;
  }

  strong {
    font-size: 0.9rem;
  }
</style>
