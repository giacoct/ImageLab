<!--
  Root shell: the header (brand and theme switch), the current page (home, a
  tool, or a saved recipe), and the drop-anywhere overlay.
-->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { router } from '../app/router.svelte';
  import { findTool } from '../app/tools';
  import DropOverlay from './DropOverlay.svelte';
  import Home from './Home.svelte';
  import ThemeSwitch from './ThemeSwitch.svelte';
  import Workspace from './Workspace.svelte';

  const route = $derived(router.route);
  const tool = $derived(route.page === 'tool' ? findTool(route.id) : undefined);
  const recipe = $derived(route.page === 'recipe' ? recipes.find(route.id) : undefined);
</script>

<header class="bar">
  <a class="brand" href="#/" aria-label="ImageLab, all tools">
    <!-- The mark: a tiny color-calibration chart, the home page's tool chart in miniature. -->
    <svg class="mark" width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect class="card" width="32" height="32" rx="7" />
      <rect x="3.5" y="8" width="7" height="7" rx="1" fill="#c29682" />
      <rect x="12.5" y="8" width="7" height="7" rx="1" fill="#d67e2c" />
      <rect x="21.5" y="8" width="7" height="7" rx="1" fill="#67bdaa" />
      <rect x="3.5" y="17" width="7" height="7" rx="1" fill="#505ba6" />
      <rect x="12.5" y="17" width="7" height="7" rx="1" fill="#e0a32e" />
      <rect x="21.5" y="17" width="7" height="7" rx="1" fill="#af363c" />
    </svg>
    <span>ImageLab</span>
  </a>
  <ThemeSwitch />
</header>

<main>
  {#if tool}
    {#key tool.id}
      <Workspace {tool} />
    {/key}
  {:else if recipe}
    {#key recipe.id}
      <Workspace {recipe} />
    {/key}
  {:else}
    <Home />
  {/if}
</main>

<DropOverlay />

<style>
  .bar {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin: 0 auto;
    max-width: 92rem;
    padding: 1.1rem 1.25rem 0;
  }

  .brand {
    align-items: center;
    color: var(--ink);
    display: flex;
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-stretch: 125%;
    font-weight: 700;
    gap: 0.6rem;
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .mark .card {
    fill: var(--frame);
    stroke: light-dark(transparent, #3a3a3a);
  }

  .mark rect:not(.card) {
    transition: transform 420ms var(--spring);
    transform-box: fill-box;
    transform-origin: center;
  }

  /* On hover the patches shuffle a little, like a chart caught in the light. */
  .brand:hover .mark rect:nth-child(odd):not(.card) {
    transform: translateY(-1.5px);
  }

  .brand:hover .mark rect:nth-child(even) {
    transform: translateY(1.5px);
  }

  main {
    margin: 0 auto;
    max-width: 92rem;
    padding: 1.75rem 1.25rem 3rem;
  }
</style>
