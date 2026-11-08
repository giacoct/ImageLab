<!--
  Root shell: the floating navigation, the current page (home, a tool, or a
  saved recipe), a short footer, and the drop-anywhere overlay.
-->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { router } from '../app/router.svelte';
  import { findTool } from '../app/tools';
  import DropOverlay from './DropOverlay.svelte';
  import Home from './Home.svelte';
  import Logo from './Logo.svelte';
  import NavBar from './NavBar.svelte';
  import ThemeSwitch from './ThemeSwitch.svelte';
  import Workspace from './Workspace.svelte';

  const route = $derived(router.route);
  const tool = $derived(route.page === 'tool' ? findTool(route.id) : undefined);
  const recipe = $derived(route.page === 'recipe' ? recipes.find(route.id) : undefined);
</script>

<NavBar />

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

<footer>
  <Logo size={20} />
  <span class="note"
    >ImageLab runs entirely in your browser. Your images never leave this device.</span
  >
  <span class="theme"><ThemeSwitch /></span>
</footer>

<DropOverlay />

<style>
  main {
    margin: 0 auto;
    max-width: 86.5rem;
    padding: 1.75rem 1.25rem 2.5rem;
  }

  footer {
    align-items: center;
    border-top: 1px solid var(--border);
    color: var(--muted);
    display: flex;
    font-size: 0.82rem;
    gap: 0.6rem;
    margin: 0 auto;
    max-width: 84rem;
    padding: 1.4rem 0.25rem 2rem;
    width: calc(100% - 2.5rem);
  }

  .note {
    flex: 1;
  }

  /* On phones the theme switch lives here rather than in the navigation. */
  @media (min-width: 560px) {
    .theme {
      display: none;
    }
  }
</style>
