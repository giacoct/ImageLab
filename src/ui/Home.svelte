<!--
  The home page: what ImageLab does, beside the canvas where images are
  brought in (the tools' effects fanned out on it until there are images,
  then the images themselves), then every tool as a card showing its effect
  as a before/after comparison, and the user's saved recipes.
-->
<script lang="ts" module>
  /*
   * The tool last opened from here. Only its card's picture takes part in
   * the page transition (it flies to the workspace's header, and back when
   * returning home): every other card would linger as a ghost.
   */
  let opened = $state<string | null>(null);
</script>

<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { session } from '../app/session.svelte';
  import { findOp } from '../ops';
  import BlobImage from './BlobImage.svelte';
  import { SHOWCASE_TOOLS } from './catalog';
  import Compare from './Compare.svelte';
  import FilePicker from './FilePicker.svelte';
  import Icon from './Icon.svelte';
  import Tile from './Tile.svelte';
  import ToolArt from './ToolArt.svelte';

  let picker: FilePicker;

  const SHOWN = 5;
  const waiting = $derived(session.items.slice(0, SHOWN));
  const more = $derived(Math.max(0, session.items.length - SHOWN));

  const FACTS = [
    { icon: 'image', text: 'JPEG, PNG, WebP, AVIF, HEIC' },
    { icon: 'offline', text: 'Works offline' },
    { icon: 'layers', text: 'Chain tools into recipes' },
  ];
</script>

<div class="home page">
  <section class="hero">
    <div class="intro">
      <h1>
        <span>Edit images right in your browser.</span>
        <span class="tone">Nothing ever leaves your device.</span>
      </h1>
      <ul class="facts">
        {#each FACTS as fact (fact.text)}
          <li><Icon name={fact.icon} size={16} />{fact.text}</li>
        {/each}
      </ul>
    </div>

    <div class="stage canvas" class:filled={session.items.length > 0}>
      {#if session.items.length}
        <ul class="fan prints" aria-hidden="true">
          {#each waiting as item, index (item.id)}
            <li class="print checker" style:--i={index} style:--n={waiting.length}>
              {#if item.info}<BlobImage blob={item.info.thumbnail} alt="" />{/if}
            </li>
          {/each}
        </ul>
        <div class="cta">
          <p class="cta-title">
            {session.items.length}
            {session.items.length === 1 ? 'image is' : 'images are'} ready{#if more}
              <span class="muted"> ({more} more not shown)</span>{/if}
          </p>
          <p class="muted">Pick a tool below to work on them.</p>
          <div class="cta-actions">
            <button class="button small" type="button" onclick={() => picker.open()}>
              <Icon name="plus" size={16} />Add more
            </button>
            <button class="button small ghost" type="button" onclick={() => session.clearFiles()}>
              Clear
            </button>
          </div>
        </div>
      {:else}
        <div class="fan" aria-hidden="true">
          <span class="shot left"><ToolArt icon="scissors" /></span>
          <span class="shot right"><ToolArt icon="adjust" /></span>
          <span class="shot center"><Compare icon="vector" demo /></span>
        </div>
        <div class="cta">
          <button class="button primary big" type="button" onclick={() => picker.open()}>
            <Icon name="upload" size={18} />Choose images
          </button>
          <p class="muted">or drop them anywhere on the page, or paste them</p>
        </div>
      {/if}
      <FilePicker bind:this={picker} />
    </div>
  </section>

  <section class="tools" aria-labelledby="tools-title">
    <h2 id="tools-title">
      <span>One workspace for every tool.</span>
      <span class="tone">Open any of them, then add steps from the others.</span>
    </h2>
    <ul class="bento">
      {#each SHOWCASE_TOOLS as { tool, wide }, index (tool.id)}
        <li class:wide style:--i={index}>
          <a class="card compare-host" href="#/tool/{tool.id}" onclick={() => (opened = tool.id)}>
            <span
              class="art"
              style:view-transition-name={opened === tool.id ? `art-${tool.id}` : undefined}
            >
              <Compare icon={tool.icon} {wide} />
            </span>
            <span class="text">
              <strong>{tool.title}</strong>
              <span class="description">{tool.description}</span>
            </span>
            <span class="go" aria-hidden="true"><Icon name="next" size={16} /></span>
          </a>
        </li>
      {/each}
    </ul>
  </section>

  {#if recipes.list.length}
    <section class="recipes" aria-labelledby="recipes-title">
      <h2 id="recipes-title">
        <span>Your recipes.</span>
        <span class="tone">Steps you saved, ready to run again.</span>
      </h2>
      <ul>
        {#each recipes.list as recipe (recipe.id)}
          <li>
            <a class="recipe" href="#/recipe/{recipe.id}">
              <Tile icon="sparkles" />
              <span class="text">
                <strong>{recipe.title}</strong>
                <span class="description">
                  {recipe.steps.length === 0
                    ? 'Export only'
                    : recipe.steps.map((step) => findOp(step.op)?.title ?? step.op).join(', ')}
                </span>
              </span>
              <Icon name="next" size={16} />
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .home {
    display: grid;
    gap: clamp(3rem, 7vw, 5.5rem);
  }

  /* Headings in two tones: the statement, then its continuation in grey. */
  h1,
  h2 {
    font-weight: 620;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .tone {
    color: var(--soft);
  }

  /* --- hero --- */

  .hero {
    align-items: center;
    display: grid;
    gap: clamp(2rem, 4vw, 3.5rem);
  }

  @media (min-width: 1000px) {
    .hero {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    }

    .stage {
      min-height: clamp(26rem, 36vw, 30rem);
    }
  }

  .intro {
    display: grid;
    gap: 1.6rem;
  }

  h1 {
    font-size: clamp(2.3rem, 4.2vw, 3.6rem);
    line-height: 1.04;
    max-width: 17ch;
  }

  h1 span {
    display: inline;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .facts li {
    align-items: center;
    color: var(--muted);
    display: flex;
    font-size: 0.9rem;
    font-weight: 500;
    gap: 0.45rem;
  }

  .facts :global(svg) {
    color: var(--accent-text);
  }

  /* The canvas where images come in. */
  .stage {
    align-content: center;
    border: 1px solid var(--border);
    border-radius: 28px;
    display: grid;
    gap: 1.6rem;
    justify-items: center;
    overflow: hidden;
    padding: 2.25rem 1.25rem 2rem;
    position: relative;
  }

  /* The tools' effects, fanned out like prints on a desk. */
  /* Each card has the scene's own proportions (8:5), so nothing on it is cropped. */
  .fan {
    aspect-ratio: 3.2;
    position: relative;
    width: min(100%, 42rem);
  }

  .fan .shot {
    animation: deal 700ms var(--spring) both;
    border: 5px solid #ffffff;
    border-radius: 18px;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.06),
      0 22px 40px -18px rgb(20 20 40 / 0.45);
    aspect-ratio: 8 / 5;
    overflow: hidden;
    position: absolute;
    top: 9%;
    transition:
      rotate 500ms var(--spring),
      translate 500ms var(--spring);
    width: 40%;
  }

  .fan .left {
    animation-delay: 80ms;
    left: 0;
    rotate: -9deg;
  }

  .fan .right {
    animation-delay: 160ms;
    right: 0;
    rotate: 8deg;
  }

  .fan .center {
    animation-delay: 240ms;
    left: 25%;
    top: -4%;
    width: 50%;
  }

  .stage:hover .left {
    rotate: -13deg;
    translate: -10px 2px;
  }

  .stage:hover .right {
    rotate: 12deg;
    translate: 10px 2px;
  }

  @keyframes deal {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.92);
    }
  }

  /* Once there are images: the user's own, fanned out the same way. */
  .prints {
    display: flex;
    height: auto;
    justify-content: center;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .print {
    animation: deal 600ms var(--spring) both;
    animation-delay: calc(var(--i) * 70ms);
    border: 5px solid #ffffff;
    border-radius: 16px;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.06),
      0 18px 34px -16px rgb(20 20 40 / 0.45);
    height: clamp(8rem, 13vw, 11.5rem);
    margin-inline: -0.7rem;
    overflow: hidden;
    rotate: calc((var(--i) - (var(--n) - 1) / 2) * 6deg);
    translate: 0 calc(max(var(--i) - (var(--n) - 1) / 2, (var(--n) - 1) / 2 - var(--i)) * 6px);
    width: clamp(8rem, 13vw, 11.5rem);
  }

  .print :global(img) {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .cta {
    display: grid;
    gap: 0.6rem;
    justify-items: center;
    max-width: 30rem;
    text-align: center;
  }

  .cta p {
    font-size: 0.86rem;
  }

  .cta-title {
    font-size: 1.15rem !important;
    font-weight: 620;
    letter-spacing: -0.02em;
  }

  .cta-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.3rem;
  }

  .big {
    font-size: 1rem;
    min-height: 3.1rem;
    padding-inline: 1.6rem;
  }

  /* --- tools --- */

  .tools,
  .recipes {
    display: grid;
    gap: 1.75rem;
  }

  h2 {
    font-size: clamp(1.6rem, 2.8vw, 2.4rem);
    line-height: 1.1;
    max-width: 34ch;
  }

  /*
   * The tools, in a bento: four columns, with some cards twice as wide;
   * three columns of equal cards on tablets; two on phones, the wide cards
   * across both.
   */
  .bento {
    display: grid;
    gap: 0.9rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .bento .wide {
    grid-column: span 2;
  }

  @media (min-width: 760px) {
    .bento {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .bento .wide {
      grid-column: auto;
    }
  }

  @media (min-width: 1100px) {
    .bento {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .bento .wide {
      grid-column: span 2;
    }
  }

  .card {
    background: var(--tile);
    border-radius: var(--radius-lg);
    color: inherit;
    display: grid;
    gap: 0.2rem;
    grid-template-rows: auto 1fr;
    height: 100%;
    padding: 0.5rem;
    position: relative;
    text-decoration: none;
    transition:
      background 220ms var(--ease),
      transform 320ms var(--spring);
  }

  .card:hover {
    background: var(--hover);
    transform: translateY(-3px);
  }

  .card:focus-visible {
    outline-offset: 3px;
  }

  .art {
    border-radius: 17px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.05);
    display: block;
    height: clamp(8rem, 14vw, 13rem);
    overflow: hidden;
  }

  .text {
    align-content: start;
    display: grid;
    gap: 0.15rem;
    padding: 0.7rem 0.6rem 0.55rem;
  }

  .text strong {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .description {
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.4;
    text-wrap: pretty;
  }

  @media (max-width: 559px) {
    .bento .description {
      display: none;
    }

    .art {
      height: 7.5rem;
    }

    .wide .art {
      height: 9.5rem;
    }
  }

  /* A round arrow chip on the picture, there when the card is pointed at. */
  .go {
    align-items: center;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
    color: #18181b;
    display: flex;
    height: 2.1rem;
    justify-content: center;
    opacity: 0;
    position: absolute;
    right: 1.1rem;
    scale: 0.7;
    top: 1.1rem;
    transition:
      opacity 200ms var(--ease),
      scale 300ms var(--spring);
    width: 2.1rem;
  }

  .card:hover .go,
  .card:focus-visible .go {
    opacity: 1;
    scale: 1;
  }

  /* --- recipes --- */

  .recipes ul {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .recipe {
    align-items: center;
    background: var(--tile);
    border-radius: 18px;
    color: inherit;
    display: flex;
    gap: 0.85rem;
    padding: 0.7rem 1rem 0.7rem 0.7rem;
    text-decoration: none;
    transition: background 200ms var(--ease);
  }

  .recipe:hover {
    background: var(--hover);
  }

  .recipe .text {
    flex: 1;
    min-width: 0;
    padding: 0;
  }

  .recipe .description {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recipe > :global(svg) {
    color: var(--muted);
  }
</style>
