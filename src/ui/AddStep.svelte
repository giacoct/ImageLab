<!-- "Add step" menu: every operation that can still be added to the recipe. -->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import Icon from './Icon.svelte';

  let menu: HTMLDetailsElement;

  function add(opId: string): void {
    session.addStep(opId);
    menu.open = false;
  }
</script>

<details class="add" bind:this={menu}>
  <summary class="button"><Icon name="plus" />Add a step</summary>
  <ul>
    {#each session.availableOps() as op (op.id)}
      <li>
        <button type="button" onclick={() => add(op.id)}>
          <Icon name={op.icon} />
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
    list-style: none;
    width: 100%;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  ul {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    display: grid;
    left: 0;
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0.35rem;
    position: absolute;
    right: 0;
    z-index: 10;
  }

  li button {
    align-items: flex-start;
    background: none;
    border: 0;
    border-radius: 0.5rem;
    display: flex;
    gap: 0.65rem;
    padding: 0.55rem 0.6rem;
    text-align: left;
    width: 100%;
  }

  li button:hover {
    background: var(--panel-subtle);
  }

  li span {
    display: grid;
  }
</style>
