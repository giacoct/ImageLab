<!--
  The home page: what ImageLab is, a place to bring images in first (or see
  the ones waiting), the user's saved recipes, and every tool.
-->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { session } from '../app/session.svelte';
  import { TOOLS } from '../app/tools';
  import { findOp } from '../ops';
  import BlobImage from './BlobImage.svelte';
  import FilePicker from './FilePicker.svelte';
  import { BRAND_HUE, hueOf } from './hues';
  import Icon from './Icon.svelte';
  import Tile from './Tile.svelte';

  let picker: FilePicker;

  const FEATURES = [
    { icon: 'shield', text: 'Private: nothing is uploaded' },
    { icon: 'offline', text: 'Works offline' },
    { icon: 'layers', text: 'Chain steps into recipes' },
  ];

  const waiting = $derived(session.items.slice(0, 4));
</script>

<div class="home page">
  <section class="hero">
    <h1>
      Image tools that
      <span class="mark">
        never upload
        <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
          <path d="M2 8.5C40 3 70 3 100 6.5s70 4 98-2" />
        </svg>
      </span>
      your photos
    </h1>
    <p class="lead">
      Everything runs right here in the browser, even OCR, SVG tracing and AI upscaling. Pick a
      tool, tweak it with a live preview, and add steps to chain more.
    </p>
    <ul class="features">
      {#each FEATURES as feature (feature.text)}
        <li><Icon name={feature.icon} size={15} />{feature.text}</li>
      {/each}
    </ul>
  </section>

  <section class="start" class:filled={session.items.length > 0} aria-label="Images">
    {#if session.items.length}
      <div class="stack" aria-hidden="true">
        {#each waiting as item, index (item.id)}
          <span class="photo checker" style:--i={index}>
            {#if item.info}<BlobImage blob={item.info.thumbnail} alt="" />{/if}
          </span>
        {/each}
      </div>
      <p>
        <strong>
          {session.items.length}
          {session.items.length === 1 ? 'image' : 'images'} ready.
        </strong>
        <span class="muted">Pick a tool below to continue.</span>
      </p>
      <div class="start-actions">
        <button class="button small" type="button" onclick={() => picker.open()}>
          <Icon name="plus" size={16} />Add more
        </button>
        <button class="button small ghost" type="button" onclick={() => session.clearFiles()}>
          Clear
        </button>
      </div>
    {:else}
      <span class="drop-icon"><Icon name="upload" size={22} /></span>
      <p>
        <strong>Start with your images</strong>
        <span class="muted">Drop them anywhere, paste them, or choose them; then pick a tool.</span>
      </p>
      <button class="button primary" type="button" onclick={() => picker.open()}>
        Choose images
      </button>
    {/if}
    <FilePicker bind:this={picker} />
  </section>

  {#if recipes.list.length}
    <section aria-labelledby="recipes-title">
      <h2 id="recipes-title">Your recipes</h2>
      <ul class="grid">
        {#each recipes.list as recipe, index (recipe.id)}
          <li style:--i={index}>
            <a class="card" href="#/recipe/{recipe.id}" style:--hue={BRAND_HUE}>
              <Tile icon="sparkles" hue={BRAND_HUE} />
              <span class="text">
                <strong>{recipe.title}</strong>
                <span class="hint">
                  {recipe.steps.length === 0
                    ? 'Export only'
                    : recipe.steps.map((step) => findOp(step.op)?.title ?? step.op).join(' → ')}
                </span>
              </span>
              <span class="go"><Icon name="next" size={16} /></span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section aria-labelledby="tools-title">
    <h2 id="tools-title">Tools</h2>
    <ul class="grid">
      {#each TOOLS as tool, index (tool.id)}
        <li style:--i={index}>
          <a class="card" href="#/tool/{tool.id}" style:--hue={hueOf(tool.icon)}>
            <Tile icon={tool.icon} />
            <span class="text">
              <strong>{tool.title}</strong>
              <span class="hint">{tool.description}</span>
            </span>
            <span class="go"><Icon name="next" size={16} /></span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .home {
    display: grid;
    gap: 2rem;
  }

  /* --- hero --- */

  .hero {
    display: grid;
    gap: 1rem;
    padding-top: 0.5rem;
  }

  h1 {
    font-size: clamp(2rem, 4.6vw, 3.6rem);
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.05;
    text-wrap: balance;
  }

  .mark {
    color: var(--accent);
    display: inline-block;
    position: relative;
    white-space: nowrap;
  }

  /* A hand-drawn underline that draws itself in. */
  .mark svg {
    bottom: -0.12em;
    height: 0.3em;
    left: 0;
    overflow: visible;
    position: absolute;
    width: 100%;
  }

  .mark path {
    animation: draw 900ms 300ms var(--ease) both;
    fill: none;
    stroke: var(--spark);
    stroke-dasharray: 220;
    stroke-linecap: round;
    stroke-width: 4;
    vector-effect: non-scaling-stroke;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 220;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  .lead {
    color: var(--muted);
    font-size: clamp(1rem, 1.6vw, 1.2rem);
    text-wrap: pretty;
  }

  .features {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    list-style: none;
    margin: 0.2rem 0 0;
    padding: 0;
  }

  .features li {
    align-items: center;
    background: color-mix(in srgb, var(--panel) 70%, transparent);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    display: flex;
    font-size: 0.8rem;
    font-weight: 600;
    gap: 0.4rem;
    padding: 0.3rem 0.75rem 0.3rem 0.6rem;
  }

  .features :global(svg) {
    color: var(--accent);
  }

  /* --- images to start with --- */

  .start {
    align-items: center;
    background: color-mix(in srgb, var(--panel) 75%, transparent);
    border: 1.5px dashed var(--border-strong);
    border-radius: var(--radius);
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem 1.1rem;
    padding: 1rem 1.2rem;
    transition:
      border-color 200ms var(--ease),
      background 200ms var(--ease);
  }

  .start.filled {
    background: var(--panel);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    border-style: solid;
    box-shadow: var(--shadow);
  }

  .start p {
    display: grid;
    flex: 1;
    min-width: 14rem;
  }

  .drop-icon {
    align-items: center;
    background: var(--accent-soft);
    border-radius: 50%;
    color: var(--accent);
    display: flex;
    height: 2.8rem;
    justify-content: center;
    width: 2.8rem;
  }

  .start-actions {
    display: flex;
    gap: 0.4rem;
  }

  /* The waiting images, fanned out like a little stack of prints. */
  .stack {
    display: flex;
    padding-left: 0.6rem;
  }

  .photo {
    animation: deal 500ms var(--spring) both;
    animation-delay: calc(var(--i) * 70ms);
    border: 3px solid var(--panel);
    border-radius: 0.55rem;
    box-shadow: var(--shadow);
    height: 3.2rem;
    margin-left: -0.9rem;
    overflow: hidden;
    rotate: calc((var(--i) - 1.5) * 6deg);
    width: 3.2rem;
  }

  .photo :global(img) {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  @keyframes deal {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.8);
    }
  }

  /* --- recipes and tools --- */

  h2 {
    color: var(--soft);
    font-family: var(--font-body);
    font-size: 0.75rem;
    letter-spacing: 0.09em;
    margin-bottom: 0.75rem;
    text-transform: uppercase;
  }

  .grid {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17.5rem), 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .grid li {
    animation: rise 480ms var(--ease) both;
    animation-delay: calc(var(--i) * 30ms + 80ms);
  }

  .card {
    align-items: flex-start;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    color: inherit;
    display: flex;
    gap: 0.9rem;
    height: 100%;
    padding: 1rem;
    position: relative;
    text-decoration: none;
    transition:
      border-color 200ms var(--ease),
      transform 260ms var(--ease),
      box-shadow 260ms var(--ease);
  }

  .card:hover,
  .card:focus-visible {
    border-color: light-dark(oklch(0.82 0.08 var(--hue)), oklch(0.5 0.08 var(--hue)));
    box-shadow:
      var(--shadow-sm),
      0 14px 30px -12px light-dark(oklch(0.6 0.12 var(--hue) / 0.35), oklch(0 0 0 / 0.6));
    transform: translateY(-3px);
  }

  .card :global(.tile) {
    transition: transform 420ms var(--spring);
  }

  .card:hover :global(.tile) {
    transform: rotate(-8deg) scale(1.08);
  }

  .card:active {
    transform: translateY(-1px) scale(0.99);
  }

  .text {
    display: grid;
    flex: 1;
    gap: 0.2rem;
    min-width: 0;
  }

  strong {
    font-family: var(--font-display);
    font-size: 1.02rem;
    font-weight: 650;
  }

  .go {
    align-self: center;
    color: light-dark(oklch(0.5 0.13 var(--hue)), oklch(0.85 0.1 var(--hue)));
    opacity: 0;
    transform: translateX(-6px);
    transition:
      opacity 200ms var(--ease),
      transform 260ms var(--ease);
  }

  .card:hover .go,
  .card:focus-visible .go {
    opacity: 1;
    transform: none;
  }
</style>
