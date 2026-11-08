<!--
  The navigation, floating at the top of every page: the brand (home), the
  Tools menu (every tool, by group, and the saved recipes, from anywhere),
  the theme switch, and "Add images", which works on any page.
-->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { session } from '../app/session.svelte';
  import { findOp } from '../ops';
  import { TOOL_GROUPS } from './catalog';
  import FilePicker from './FilePicker.svelte';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import ThemeSwitch from './ThemeSwitch.svelte';
  import Tile from './Tile.svelte';
  import ToolArt from './ToolArt.svelte';

  let picker: FilePicker;
  let menu: HTMLDivElement;

  const close = () => menu.hidePopover();
</script>

<header class="bar">
  <nav class="nav" aria-label="Main">
    <a class="brand" href="#/"><Logo /><span>ImageLab</span></a>
    <button class="nav-button" type="button" popovertarget="tools-menu">
      Tools <Icon name="down" size={15} />
    </button>
    <span class="spacer"></span>
    <span class="theme"><ThemeSwitch /></span>
    <button class="button primary small add" type="button" onclick={() => picker.open()}>
      <Icon name="plus" size={16} /><span class="add-label">Add images</span>
      {#if session.items.length}<span class="count">{session.items.length}</span>{/if}
    </button>
    <FilePicker bind:this={picker} />
  </nav>

  <div id="tools-menu" class="menu" popover bind:this={menu}>
    <div class="groups">
      {#each TOOL_GROUPS as group (group.title)}
        <section aria-label={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {#each group.tools as tool (tool.id)}
              <li>
                <a href="#/tool/{tool.id}" onclick={close}>
                  <span class="thumb"><ToolArt icon={tool.icon} /></span>
                  <span class="text">
                    <strong>{tool.title}</strong>
                    <span>{tool.description}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
      {#if recipes.list.length}
        <section aria-label="Your recipes">
          <h2>Your recipes</h2>
          <ul>
            {#each recipes.list as recipe (recipe.id)}
              <li>
                <a href="#/recipe/{recipe.id}" onclick={close}>
                  <Tile icon="sparkles" />
                  <span class="text">
                    <strong>{recipe.title}</strong>
                    <span>
                      {recipe.steps.length === 0
                        ? 'Export only'
                        : recipe.steps.map((step) => findOp(step.op)?.title ?? step.op).join(', ')}
                    </span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  </div>
</header>

<style>
  /* Floats over the page while scrolling on wide screens; scrolls away on phones, where room is short. */
  .bar {
    padding: 0.75rem 1.25rem 0;
    position: relative;
    z-index: 40;
  }

  @media (min-width: 960px) {
    .bar {
      position: sticky;
      top: 0;
    }
  }

  .nav {
    align-items: center;
    backdrop-filter: saturate(1.6) blur(18px);
    background: color-mix(in srgb, var(--panel) 82%, transparent);
    border: 1px solid var(--border);
    border-radius: 999px;
    box-shadow: var(--shadow);
    display: flex;
    gap: 0.35rem;
    margin: 0 auto;
    max-width: 84rem;
    padding: 0.35rem 0.4rem 0.35rem 0.55rem;
  }

  .brand {
    align-items: center;
    border-radius: 999px;
    color: var(--ink);
    display: flex;
    font-size: 1.05rem;
    font-weight: 650;
    gap: 0.55rem;
    letter-spacing: -0.02em;
    margin-right: 0.4rem;
    padding: 0.15rem 0.5rem 0.15rem 0.15rem;
    text-decoration: none;
  }

  .brand :global(svg) {
    transition: transform 420ms var(--spring);
  }

  .brand:hover :global(svg) {
    transform: rotate(-8deg) scale(1.06);
  }

  .nav-button {
    align-items: center;
    background: none;
    border: 0;
    border-radius: 999px;
    color: var(--muted);
    display: flex;
    font-size: 0.92rem;
    font-weight: 560;
    gap: 0.25rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.85rem;
    transition:
      background 160ms var(--ease),
      color 160ms var(--ease);
  }

  .nav-button:hover,
  .bar:has(.menu:popover-open) .nav-button {
    background: var(--hover);
    color: var(--ink);
  }

  .spacer {
    flex: 1;
  }

  .add {
    margin-left: 0.25rem;
  }

  /* Phones have no room for it here: it's in the footer instead (App.svelte). */
  @media (max-width: 559px) {
    .theme {
      display: none;
    }
  }

  .count {
    background: rgb(255 255 255 / 0.22);
    border-radius: 999px;
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
    padding: 0 0.45rem;
  }

  @media (max-width: 559px) {
    .add-label {
      clip-path: inset(50%);
      height: 1px;
      overflow: hidden;
      position: absolute;
      width: 1px;
    }

    .add {
      padding-inline: 0.7rem;
    }
  }

  /* --- the Tools menu --- */

  .menu {
    animation: menu-in 260ms var(--ease);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    color: var(--ink);
    inset: 4.6rem auto auto 50%;
    margin: 0;
    max-height: calc(100dvh - 5.6rem);
    overflow-y: auto;
    padding: 1.1rem;
    position: fixed;
    translate: -50% 0;
    width: min(64rem, calc(100vw - 1.5rem));
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.985);
    }
  }

  .groups {
    display: grid;
    gap: 1.2rem 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  }

  h2 {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 560;
    letter-spacing: 0;
    padding: 0 0.5rem 0.45rem;
  }

  ul {
    display: grid;
    gap: 0.1rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li a {
    align-items: center;
    border-radius: 14px;
    color: inherit;
    display: flex;
    gap: 0.8rem;
    padding: 0.45rem 0.5rem;
    text-decoration: none;
    transition: background 140ms var(--ease);
  }

  li a:hover,
  li a:focus-visible {
    background: var(--hover);
  }

  .thumb {
    border-radius: 9px;
    box-shadow: 0 0 0 1px var(--border);
    flex: none;
    height: 2.6rem;
    overflow: hidden;
    transition: transform 300ms var(--spring);
    width: 4rem;
  }

  li a:hover .thumb {
    transform: scale(1.05) rotate(-2deg);
  }

  .text {
    display: grid;
    min-width: 0;
  }

  .text strong {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .text span {
    color: var(--muted);
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
