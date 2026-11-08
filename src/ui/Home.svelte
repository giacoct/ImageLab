<!--
  The home page: what ImageLab is, the "light table" where images are brought
  in first (or shown while they wait), and the tools laid out as a
  color-calibration chart, one patch per tool, with the user's saved recipes
  as the chart's grey row.
-->
<script lang="ts" module>
  // The chart "develops" from grey into color once per visit, not every
  // time the home page is opened again.
  let developed = false;
</script>

<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { session } from '../app/session.svelte';
  import { TOOLS } from '../app/tools';
  import { findOp } from '../ops';
  import BlobImage from './BlobImage.svelte';
  import FilePicker from './FilePicker.svelte';
  import Icon from './Icon.svelte';
  import { NEUTRAL, patchOf } from './patches';

  let picker: FilePicker;

  const develop = !developed;
  developed = true;

  const SHOWN = 6;
  const waiting = $derived(session.items.slice(0, SHOWN));
  const more = $derived(Math.max(0, session.items.length - SHOWN));
</script>

<div class="home page">
  <div class="intro">
    <h1>Image tools that run on this device</h1>
    <p class="lead">
      Resize, convert, compress, clean metadata, trace to SVG, read text and upscale, all in the
      browser. Nothing is uploaded, and it works offline.
    </p>

    <section class="table crop-marks" class:filled={session.items.length > 0} aria-label="Images">
      {#if session.items.length}
        <ul class="sheet" aria-hidden="true">
          {#each waiting as item, index (item.id)}
            <li class="print checker" style:--i={index}>
              {#if item.info}<BlobImage blob={item.info.thumbnail} alt="" />{/if}
            </li>
          {/each}
          {#if more}<li class="print more">+{more}</li>{/if}
        </ul>
        <p class="table-text">
          <strong>
            {session.items.length}
            {session.items.length === 1 ? 'image is' : 'images are'} ready
          </strong>
          <span class="muted">Pick a tool to work on them.</span>
        </p>
        <div class="table-actions">
          <button class="button small" type="button" onclick={() => picker.open()}>
            <Icon name="plus" size={16} />Add more
          </button>
          <button class="button small ghost" type="button" onclick={() => session.clearFiles()}>
            Clear
          </button>
        </div>
      {:else}
        <p class="table-text">
          <strong>Drop images here</strong>
          <span class="muted">Or anywhere on the page, or paste them. Then pick a tool.</span>
        </p>
        <div class="table-actions">
          <button class="button primary" type="button" onclick={() => picker.open()}>
            <Icon name="upload" size={16} />Choose images
          </button>
          <span class="hint">JPEG, PNG, WebP, AVIF, GIF, HEIC</span>
        </div>
      {/if}
      <FilePicker bind:this={picker} />
    </section>
  </div>

  <section class="chart" class:develop aria-labelledby="tools-title">
    <h2 class="visually-hidden" id="tools-title">Tools</h2>
    <ul class="patches">
      {#each TOOLS as tool, index (tool.id)}
        {@const patch = patchOf(tool.icon)}
        <li style:--i={index}>
          <a
            class="patch ink-{patch.ink}"
            href="#/tool/{tool.id}"
            style:--patch={patch.color}
            aria-describedby="tool-{tool.id}"
          >
            <Icon name={tool.icon} size={22} />
            <span class="name">{tool.title}</span>
            <span class="description" id="tool-{tool.id}">{tool.description}</span>
          </a>
        </li>
      {/each}
    </ul>

    {#if recipes.list.length}
      <h2 class="recipes-title" id="recipes-title">Your recipes</h2>
      <ul class="patches recipes" aria-labelledby="recipes-title">
        {#each recipes.list as recipe (recipe.id)}
          <li>
            <a
              class="patch ink-{NEUTRAL.recipe.ink}"
              href="#/recipe/{recipe.id}"
              style:--patch={NEUTRAL.recipe.color}
            >
              <Icon name="sparkles" size={20} />
              <span class="name">{recipe.title}</span>
              <span class="description">
                {recipe.steps.length === 0
                  ? 'Export only'
                  : recipe.steps.map((step) => findOp(step.op)?.title ?? step.op).join(' → ')}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .home {
    align-items: start;
    display: grid;
    gap: 2.5rem;
  }

  @media (min-width: 1080px) {
    .home {
      gap: clamp(2.5rem, 5vw, 5rem);
      grid-template-columns: minmax(22rem, 5fr) 7fr;
    }

    .intro {
      position: sticky;
      top: 1.75rem;
    }
  }

  /* --- introduction --- */

  .intro {
    display: grid;
    gap: 1.4rem;
  }

  h1 {
    font-size: clamp(2.3rem, 5.2vw, 4.4rem);
    font-stretch: 125%;
    font-weight: 720;
    letter-spacing: -0.035em;
    line-height: 0.98;
    max-width: 11ch;
    text-wrap: balance;
  }

  .lead {
    color: var(--muted);
    font-size: clamp(1rem, 1.3vw, 1.12rem);
    line-height: 1.55;
    max-width: 36ch;
    text-wrap: pretty;
  }

  /*
   * The light table: a lit sheet framed by crop marks where images land.
   * Once there are images it shows them as a contact sheet.
   */
  .table {
    align-content: center;
    box-shadow: var(--shadow);
    display: grid;
    gap: 1.1rem;
    margin-top: 0.6rem;
    min-height: 13rem;
    padding: 1.8rem;
  }

  @media (max-width: 639px) {
    .table {
      --mark-size: 8px;
      --mark-gap: 4px;
      padding: 1.4rem;
    }
  }

  .table-text {
    display: grid;
    gap: 0.25rem;
  }

  .table-text strong {
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-stretch: 112%;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .table-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 0.9rem;
  }

  .sheet {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .print {
    animation: lay 420ms var(--ease) both;
    animation-delay: calc(var(--i, 0) * 50ms);
    border: 3px solid var(--panel);
    box-shadow:
      0 0 0 1px var(--border-strong),
      var(--shadow-sm);
    height: 4rem;
    overflow: hidden;
    width: 4rem;
  }

  .print :global(img) {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .more {
    align-items: center;
    background: var(--panel-subtle);
    color: var(--muted);
    display: flex;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    justify-content: center;
  }

  @keyframes lay {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(1.04);
    }
  }

  /* --- the chart --- */

  .chart {
    background: var(--frame);
    border-radius: 10px;
    box-shadow:
      0 0 0 1px light-dark(transparent, #2c2c2c),
      var(--shadow-lg);
    display: grid;
    gap: clamp(0.4rem, 0.8vw, 0.6rem);
    padding: clamp(0.5rem, 1.2vw, 0.9rem);
  }

  .patches {
    display: grid;
    gap: inherit;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  @media (min-width: 640px) {
    .patches {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (min-width: 1500px) {
    .patches:not(.recipes) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .patch {
    align-content: start;
    background: var(--patch);
    border-radius: var(--radius-patch);
    display: grid;
    gap: 0.3rem;
    grid-template-rows: auto 1fr auto auto;
    height: 100%;
    min-height: 6.4rem;
    padding: 0.8rem 0.85rem 0.85rem;
    position: relative;
    text-decoration: none;
    transition:
      box-shadow 220ms var(--ease),
      filter 220ms var(--ease);
  }

  @media (min-width: 640px) {
    .patch {
      min-height: 10.25rem;
      padding: 1rem 1.05rem 1.1rem;
    }
  }

  .patch :global(svg) {
    grid-row: 1;
    transition: transform 360ms var(--spring);
  }

  .name {
    font-family: var(--font-display);
    font-size: 1.02rem;
    font-stretch: 112%;
    font-weight: 650;
    grid-row: 3;
    letter-spacing: -0.005em;
    line-height: 1.15;
  }

  .description {
    font-size: 0.8rem;
    grid-row: 4;
    line-height: 1.35;
    text-wrap: pretty;
  }

  /* Narrow patches keep only the tool's name; the workspace says the rest. */
  @media (max-width: 639px) {
    .description {
      display: none;
    }

    .name {
      font-size: 0.95rem;
    }
  }

  /* Hover and focus ring the patch, as if picked on the chart. */
  .patch:hover {
    box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.6);
    filter: brightness(1.05);
  }

  .patch:hover :global(svg) {
    transform: scale(1.12) rotate(-6deg);
  }

  .patch:focus-visible {
    box-shadow:
      inset 0 0 0 3px #ffffff,
      inset 0 0 0 5px #1e1e1e;
    outline: none;
  }

  .patch:active {
    filter: brightness(0.96);
  }

  /*
   * The one orchestrated moment: on the first visit the patches develop,
   * like a print in the tray, from a pale grey into their colors, one
   * after another across the chart.
   */
  .develop .patches li {
    animation: develop 900ms var(--ease) both;
    animation-delay: calc(var(--i) * 55ms + 120ms);
  }

  @keyframes develop {
    0% {
      filter: grayscale(1) brightness(1.6) contrast(0.5);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
  }

  .recipes-title {
    color: #c8c8c8;
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-stretch: 100%;
    font-weight: 600;
    letter-spacing: 0;
    padding: 0.5rem 0.2rem 0;
  }

  .recipes .patch {
    min-height: 6.5rem;
  }

  .recipes .description {
    display: block;
  }
</style>
