<!--
  The header of a workspace card: hued icon tile, a small label saying where
  the card sits in the flow ("Input", "Step 2", "Output"), the title, and
  optional actions on the right.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import Tile from './Tile.svelte';

  let {
    icon,
    hue,
    eyebrow,
    title,
    id,
    children,
  }: {
    icon: string;
    hue?: number;
    eyebrow: string;
    title: string;
    /** Id of the title, for `aria-labelledby`. */
    id?: string;
    children?: Snippet;
  } = $props();
</script>

<header class="head">
  <Tile {icon} {hue} small />
  <div class="titles">
    <span class="eyebrow">{eyebrow}</span>
    <h2 {id}>{title}</h2>
  </div>
  {#if children}<div class="actions">{@render children()}</div>{/if}
</header>

<style>
  .head {
    align-items: center;
    display: flex;
    gap: 0.7rem;
  }

  .titles {
    display: grid;
    flex: 1;
    line-height: 1.2;
    min-width: 0;
  }

  h2 {
    align-items: center;
    display: flex;
    font-size: 1rem;
    font-weight: 650;
    gap: 0.45rem;
  }

  .actions {
    align-items: center;
    display: flex;
    flex: none;
    gap: 0.15rem;
  }
</style>
