<!--
  The head of a section of the workspace's process sheet: the step's icon
  tile (the node on the sheet's rail), where the section sits in the flow when it
  is a numbered step ("Step 2"), the title, and optional actions on the right.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import Tile from './Tile.svelte';

  let {
    icon,
    eyebrow,
    title,
    id,
    children,
  }: {
    icon: string;
    eyebrow?: string;
    title: string;
    /** Id of the title, for `aria-labelledby`. */
    id?: string;
    children?: Snippet;
  } = $props();
</script>

<header class="head">
  <span class="node"><Tile {icon} small /></span>
  <div class="titles">
    {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
    <h2 {id}>{title}</h2>
  </div>
  {#if children}<div class="actions">{@render children()}</div>{/if}
</header>

<style>
  .head {
    align-items: center;
    display: flex;
    gap: 0.7rem;
    min-height: 2rem;
  }

  /* The tile sits on the sheet's rail, in the gutter left of the content. */
  .node {
    display: flex;
    left: 0;
    position: absolute;
  }

  .titles {
    align-items: baseline;
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0 0.55rem;
    min-width: 0;
  }

  h2 {
    font-size: 1.02rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .actions {
    align-items: center;
    display: flex;
    flex: none;
    gap: 0.15rem;
  }
</style>
