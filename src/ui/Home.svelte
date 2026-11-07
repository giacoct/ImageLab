<!-- The home page: every tool, the user's saved recipes, and any images waiting. -->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { session } from '../app/session.svelte';
  import { TOOLS } from '../app/tools';
  import Icon from './Icon.svelte';
</script>

<div class="home">
  <section class="intro">
    <h1>Image tools that never upload your photos</h1>
    <p class="muted">
      Everything runs on this device, in the browser — even OCR, SVG tracing and AI upscaling. Pick
      a tool, then add steps to chain more.
    </p>
  </section>

  {#if session.items.length}
    <p class="notice info">
      <Icon name="image" size={16} />
      {session.items.length}
      {session.items.length === 1 ? 'image is' : 'images are'} ready — pick a tool to continue.
    </p>
  {/if}

  {#if recipes.list.length}
    <section aria-labelledby="recipes-title">
      <h2 id="recipes-title">Your recipes</h2>
      <ul class="grid">
        {#each recipes.list as recipe (recipe.id)}
          <li>
            <a class="card" href="#/recipe/{recipe.id}">
              <span class="icon recipe"><Icon name="save" /></span>
              <span>
                <strong>{recipe.title}</strong>
                <span class="hint">
                  {recipe.steps.length === 0
                    ? 'Export only'
                    : `${recipe.steps.length} step${recipe.steps.length === 1 ? '' : 's'}`}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section aria-labelledby="tools-title">
    <h2 id="tools-title">Tools</h2>
    <ul class="grid">
      {#each TOOLS as tool (tool.id)}
        <li>
          <a class="card" href="#/tool/{tool.id}">
            <span class="icon"><Icon name={tool.icon} /></span>
            <span>
              <strong>{tool.title}</strong>
              <span class="hint">{tool.description}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .home {
    display: grid;
    gap: 1.75rem;
  }

  .intro {
    display: grid;
    gap: 0.4rem;
    max-width: 44rem;
  }

  h1 {
    font-size: clamp(1.35rem, 3vw, 1.8rem);
    line-height: 1.2;
  }

  h2 {
    color: var(--muted);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    margin-bottom: 0.65rem;
    text-transform: uppercase;
  }

  .notice {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }

  .grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .card {
    align-items: flex-start;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: inherit;
    display: flex;
    gap: 0.85rem;
    height: 100%;
    padding: 0.95rem;
    text-decoration: none;
    transition:
      border-color 140ms var(--ease),
      transform 140ms var(--ease),
      box-shadow 140ms var(--ease);
  }

  .card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow);
    transform: translateY(-1px);
  }

  .card > span:last-child {
    display: grid;
    gap: 0.2rem;
  }

  .icon {
    align-items: center;
    background: var(--accent-soft);
    border-radius: 0.6rem;
    color: var(--accent-strong);
    display: flex;
    flex: none;
    height: 2.4rem;
    justify-content: center;
    width: 2.4rem;
  }

  .icon.recipe {
    background: var(--warning-soft);
    color: var(--warning);
  }
</style>
