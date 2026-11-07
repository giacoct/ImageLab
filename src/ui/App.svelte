<!--
  Root shell: a softly drifting color wash behind everything, the header
  (brand and theme switch), the current page (home, a tool, or a saved
  recipe), and the drop-anywhere overlay.
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

<div class="wash" aria-hidden="true"><span></span><span></span><span></span></div>

<header class="bar">
  <a class="brand" href="#/">
    <svg class="mark" width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" />
      <circle class="sun" cx="11" cy="11.5" r="3" />
      <path class="hills" d="M6 24.5 12.5 16l3.6 5 5.2-7.5 5.2 8.2v2.8z" />
    </svg>
    <span>Image<b>Lab</b></span>
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
  /*
   * Three large, soft blobs of color behind the page. Plain radial gradients
   * (no blur filter) moved with transforms, so they cost nothing to animate.
   */
  .wash {
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    position: fixed;
    z-index: -1;
  }

  .wash span {
    border-radius: 50%;
    height: 60vmax;
    position: absolute;
    width: 60vmax;
  }

  .wash span:nth-child(1) {
    animation: drift-a 38s ease-in-out infinite alternate;
    background: radial-gradient(
      closest-side,
      light-dark(oklch(0.86 0.09 185 / 0.55), oklch(0.45 0.08 190 / 0.35)),
      transparent
    );
    left: -22vmax;
    top: -30vmax;
  }

  .wash span:nth-child(2) {
    animation: drift-b 46s ease-in-out infinite alternate;
    background: radial-gradient(
      closest-side,
      light-dark(oklch(0.88 0.08 45 / 0.42), oklch(0.45 0.08 35 / 0.2)),
      transparent
    );
    right: -26vmax;
    top: -24vmax;
  }

  .wash span:nth-child(3) {
    animation: drift-a 52s ease-in-out infinite alternate-reverse;
    background: radial-gradient(
      closest-side,
      light-dark(oklch(0.87 0.07 290 / 0.35), oklch(0.42 0.08 290 / 0.22)),
      transparent
    );
    bottom: -40vmax;
    left: 20vw;
  }

  @keyframes drift-a {
    to {
      transform: translate(8vmax, 6vmax) scale(1.08);
    }
  }

  @keyframes drift-b {
    to {
      transform: translate(-10vmax, 8vmax) scale(0.92);
    }
  }

  .bar {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin: 0 auto;
    max-width: 82rem;
    padding: 1rem 1rem 0;
  }

  .brand {
    align-items: center;
    color: var(--ink);
    display: flex;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    gap: 0.5rem;
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .brand b {
    color: var(--accent);
    font-weight: 800;
  }

  .mark {
    filter: drop-shadow(0 4px 8px color-mix(in oklch, var(--accent) 35%, transparent));
    transition: transform 400ms var(--spring);
  }

  .mark rect {
    fill: var(--accent);
  }

  .mark .sun,
  .mark .hills {
    fill: var(--on-accent);
    transition: transform 500ms var(--spring);
  }

  /* On hover the logo tilts and its sun rises. */
  .brand:hover .mark {
    transform: rotate(-8deg) scale(1.06);
  }

  .brand:hover .sun {
    transform: translate(1px, -2.5px);
  }

  main {
    margin: 0 auto;
    max-width: 82rem;
    padding: 1.5rem 1rem 3rem;
  }
</style>
