<!--
  Root shell: the header, the current page (home, a tool, or a saved recipe),
  and the page-wide drop and paste handling.
-->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { router } from '../app/router.svelte';
  import { findTool } from '../app/tools';
  import DropOverlay from './DropOverlay.svelte';
  import Home from './Home.svelte';
  import Workspace from './Workspace.svelte';

  const route = $derived(router.route);
  const tool = $derived(route.page === 'tool' ? findTool(route.id) : undefined);
  const recipe = $derived(route.page === 'recipe' ? recipes.find(route.id) : undefined);
</script>

<header>
  <a href="#/">ImageLab</a>
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
  header {
    border-bottom: 1px solid var(--border);
    padding: 0.6rem 1rem;
  }

  header a {
    color: inherit;
    font-weight: 700;
    text-decoration: none;
  }

  main {
    margin: 0 auto;
    max-width: 90rem;
    padding: 1rem 1rem 3rem;
  }
</style>
