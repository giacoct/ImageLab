<!--
  Root shell: the header (with the theme choice), the current page (home, a
  tool, or a saved recipe), and the page-wide drop and paste handling.
-->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { router } from '../app/router.svelte';
  import { theme, type ThemePreference } from '../app/theme.svelte';
  import { findOp } from '../ops';
  import DropOverlay from './DropOverlay.svelte';
  import Home from './Home.svelte';
  import Workspace from './Workspace.svelte';

  const route = $derived(router.route);
  const tool = $derived(route.page === 'tool' ? findOp(route.id) : undefined);
  const recipe = $derived(route.page === 'recipe' ? recipes.find(route.id) : undefined);
</script>

<header>
  <a href="#/">ImageLab</a>
  <select
    aria-label="Theme"
    value={theme.preference}
    onchange={(event) => theme.set(event.currentTarget.value as ThemePreference)}
  >
    <option value="system">System theme</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
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
    align-items: center;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
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
