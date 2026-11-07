<!-- Root shell: header and the current page (home, a tool, or a saved recipe). -->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { router } from '../app/router.svelte';
  import { findTool } from '../app/tools';
  import Home from './Home.svelte';
  import Workspace from './Workspace.svelte';

  const route = $derived(router.route);
  const tool = $derived(route.page === 'tool' ? findTool(route.id) : undefined);
  const recipe = $derived(route.page === 'recipe' ? recipes.find(route.id) : undefined);
</script>

<header class="bar">
  <a class="brand" href="#/">
    <img src="logo.png" alt="" width="28" height="28" />
    ImageLab
  </a>
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

<style>
  .bar {
    align-items: center;
    display: flex;
    margin: 0 auto;
    max-width: 82rem;
    padding: 0.9rem 1rem 0;
  }

  .brand {
    align-items: center;
    color: var(--ink);
    display: flex;
    font-size: 1.05rem;
    font-weight: 800;
    gap: 0.55rem;
    text-decoration: none;
  }

  .brand img {
    border-radius: 0.4rem;
  }

  main {
    margin: 0 auto;
    max-width: 82rem;
    padding: 1.25rem 1rem 3rem;
  }
</style>
