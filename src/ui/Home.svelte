<!--
  The home page is one color-calibration chart: the headline printed on the
  chart's black card, its lit white cell as the "light table" where images
  are brought in (or shown while they wait), a patch per tool, and the
  user's saved recipes as the chart's grey patches. Each patch grows into
  its tool's workspace banner when opened (router.svelte.ts).
-->
<script lang="ts" module>
  // The headline stretches and the chart "develops" once per visit, not
  // every time the home page is opened again.
  let played = false;
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

  const intro = !played;
  played = true;

  const SHOWN = 5;
  const waiting = $derived(session.items.slice(0, SHOWN));
  const more = $derived(Math.max(0, session.items.length - SHOWN));
</script>

<div class="home page">
  <div class="chart" class:intro>
    <div class="title">
      <h1>
        <span>Image tools</span>
        <span>that run on</span>
        <span>this device</span>
      </h1>
      <p class="lead">
        Resize, convert, compress, clean metadata, trace to SVG, read text and upscale, all in the
        browser. Nothing is uploaded, and it works offline.
      </p>
    </div>

    <section class="lightbox" aria-label="Images">
      <div class="print-area crop-marks">
        {#if session.items.length}
          <ul class="sheet" aria-hidden="true">
            {#each waiting as item, index (item.id)}
              <li class="print checker" style:--i={index}>
                {#if item.info}<BlobImage blob={item.info.thumbnail} alt="" />{/if}
              </li>
            {/each}
            {#if more}<li class="print more">+{more}</li>{/if}
          </ul>
          <p class="box-text">
            <strong>
              {session.items.length}
              {session.items.length === 1 ? 'image is' : 'images are'} ready
            </strong>
            <span class="muted">Pick a tool to work on them.</span>
          </p>
          <div class="box-actions">
            <button class="button small" type="button" onclick={() => picker.open()}>
              <Icon name="plus" size={16} />Add more
            </button>
            <button class="button small ghost" type="button" onclick={() => session.clearFiles()}>
              Clear
            </button>
          </div>
        {:else}
          <p class="box-text">
            <strong>Drop images here</strong>
            <span class="muted">Or anywhere on the page, or paste them. Then pick a tool.</span>
          </p>
          <div class="box-actions">
            <button class="button primary" type="button" onclick={() => picker.open()}>
              <Icon name="upload" size={16} />Choose images
            </button>
            <span class="hint">JPEG, PNG, WebP, AVIF, GIF, HEIC</span>
          </div>
        {/if}
      </div>
      <span class="glyph" aria-hidden="true">
        <Icon name={session.items.length ? 'image' : 'upload'} size={260} />
      </span>
      <FilePicker bind:this={picker} />
    </section>

    <h2 class="visually-hidden" id="tools-title">Tools</h2>
    <!-- `display: contents` lets the patches flow around the cells above; the roles keep it a list. -->
    <ul class="patches" role="list" aria-labelledby="tools-title">
      {#each TOOLS as tool, index (tool.id)}
        {@const patch = patchOf(tool.icon)}
        <li role="listitem" style:--i={index}>
          <a
            class="patch ink-{patch.ink}"
            href="#/tool/{tool.id}"
            style:--patch={patch.color}
            style:view-transition-name="tool-{tool.id}"
            style:view-transition-class="patch"
          >
            <span class="name">{tool.title}</span>
            <span class="description">{tool.description}</span>
            <span class="glyph" aria-hidden="true"><Icon name={tool.icon} size={112} /></span>
          </a>
        </li>
      {/each}
    </ul>

    {#if recipes.list.length}
      <h2 class="label" id="recipes-title">Your recipes</h2>
      <ul class="patches" role="list" aria-labelledby="recipes-title">
        {#each recipes.list as recipe (recipe.id)}
          <li role="listitem">
            <a
              class="patch ink-{NEUTRAL.recipe.ink}"
              href="#/recipe/{recipe.id}"
              style:--patch={NEUTRAL.recipe.color}
              style:view-transition-name="recipe-{recipe.id}"
              style:view-transition-class="patch"
            >
              <span class="name">{recipe.title}</span>
              <span class="description steps">
                {recipe.steps.length === 0
                  ? 'Export only'
                  : recipe.steps.map((step) => findOp(step.op)?.title ?? step.op).join(' → ')}
              </span>
              <span class="glyph" aria-hidden="true"><Icon name="sparkles" size={112} /></span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  /*
   * The chart: a black card holding a grid of cells. Two columns on phones,
   * three on tablets; from 1100px four, with the headline and the light
   * table stacked on the left half and the patches flowing around them.
   */
  .chart {
    --gap: clamp(0.4rem, 0.7vw, 0.55rem);
    background: var(--frame);
    border-radius: 12px;
    box-shadow:
      0 0 0 1px light-dark(transparent, #2c2c2c),
      var(--shadow-lg);
    color-scheme: dark; /* text printed on the card reads light in either theme */
    color: var(--ink);
    display: grid;
    gap: var(--gap);
    grid-auto-rows: minmax(6.5rem, auto);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: var(--gap);
  }

  /* Below 1100px the headline and the light table each take a whole row. */
  .title,
  .lightbox,
  .label {
    grid-column: 1 / -1;
  }

  @media (max-width: 639px) {
    /* Edge to edge on phones: the chart is the page. */
    .chart {
      border-radius: 0;
      margin-inline: -1.25rem;
    }
  }

  @media (min-width: 640px) {
    .chart {
      grid-auto-rows: minmax(9rem, auto);
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (min-width: 1100px) {
    .chart {
      grid-auto-rows: minmax(9.25rem, 1fr);
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .title {
      grid-column: 1 / 3;
      grid-row: 1 / 3;
    }

    .lightbox {
      grid-column: 1 / 3;
      grid-row: 3 / 5;
    }
  }

  .patches {
    display: contents;
  }

  .patches li {
    list-style: none;
  }

  /* --- the headline, printed on the card --- */

  .title {
    align-content: center;
    container-type: inline-size;
    display: grid;
    gap: 1.1rem;
    padding: clamp(1.4rem, 3vw, 2.2rem) clamp(0.9rem, 2.5vw, 2rem);
  }

  h1 {
    color: #f3f3f2;
    font-size: clamp(2rem, 12.4cqi, 5.4rem);
    font-stretch: 125%;
    font-weight: 780;
    letter-spacing: -0.035em;
    line-height: 0.94;
  }

  h1 span {
    display: block;
    white-space: nowrap;
  }

  .lead {
    color: var(--muted);
    font-size: clamp(0.95rem, 1.2vw, 1.08rem);
    line-height: 1.55;
    max-width: 40ch;
    text-wrap: pretty;
  }

  /* --- the light table: the chart's lit white cell --- */

  .lightbox {
    background: radial-gradient(120% 90% at 50% 40%, #ffffff 55%, #ececea);
    border-radius: var(--radius-patch);
    color: var(--ink);
    color-scheme: light; /* always lit, whatever the theme */
    display: grid;
    overflow: hidden;
    padding: clamp(1.1rem, 2.4vw, 1.9rem);
    position: relative;
  }

  .lightbox .glyph {
    bottom: -3.5rem;
    color: #1e1e1e;
    opacity: 0.05;
    right: -2.5rem;
  }

  @media (max-width: 639px) {
    .lightbox .glyph :global(svg) {
      height: 170px;
      width: 170px;
    }
  }

  .print-area {
    --mark: #1e1e1e;
    --mark-size: clamp(10px, 1.6vw, 22px);
    --mark-gap: clamp(5px, 0.8vw, 10px);
    align-content: center;
    background: transparent;
    display: grid;
    gap: 1.1rem;
    padding: clamp(0.4rem, 1.5vw, 1.4rem);
    z-index: 1;
  }

  .box-text {
    display: grid;
    gap: 0.25rem;
  }

  .box-text strong {
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 2.6vw, 2.3rem);
    font-stretch: 122%;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .box-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 0.9rem;
  }

  .sheet {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* The waiting images, laid on the table like prints, each a little askew. */
  .print {
    animation: lay 480ms var(--spring) both;
    animation-delay: calc(var(--i, 0) * 60ms);
    border: 3px solid #ffffff;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.12),
      0 6px 14px -6px rgb(0 0 0 / 0.35);
    height: 4.2rem;
    overflow: hidden;
    rotate: calc((var(--i, 0) - 2) * 2.5deg);
    width: 4.2rem;
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
    rotate: 0deg;
  }

  @keyframes lay {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(1.08);
    }
  }

  /* --- the patches --- */

  .patch {
    background: var(--patch);
    border-radius: var(--radius-patch);
    display: grid;
    gap: 0.3rem;
    grid-template-rows: auto auto 1fr;
    height: 100%;
    overflow: hidden;
    padding: 0.85rem 0.9rem;
    position: relative;
    text-decoration: none;
    transition:
      transform 260ms var(--spring),
      box-shadow 260ms var(--ease);
  }

  @media (min-width: 640px) {
    .patch {
      padding: 1rem 1.1rem;
    }
  }

  .name {
    font-family: var(--font-display);
    font-size: clamp(0.95rem, 1.25vw, 1.12rem);
    font-stretch: 115%;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.12;
    position: relative;
  }

  .description {
    font-size: 0.8rem;
    line-height: 1.35;
    max-width: 24ch;
    position: relative;
    text-wrap: pretty;
  }

  /* Narrow patches keep only the tool's name; its workspace says the rest. */
  @media (max-width: 639px) {
    .description:not(.steps) {
      display: none;
    }
  }

  /* A giant pictogram, tone on tone, bleeding off the corner. */
  .glyph {
    bottom: -1.6rem;
    display: flex;
    opacity: 0.22;
    position: absolute;
    right: -1.1rem;
    rotate: -10deg;
    transition:
      rotate 420ms var(--spring),
      scale 420ms var(--spring),
      opacity 260ms var(--ease);
  }

  @media (max-width: 639px) {
    .glyph :global(svg) {
      height: 84px;
      width: 84px;
    }
  }

  /* Hover lifts the patch off the card like a sticker; its pictogram turns. */
  .patch:hover {
    box-shadow:
      0 14px 28px -10px rgb(0 0 0 / 0.7),
      inset 0 0 0 1px rgb(255 255 255 / 0.25);
    transform: translateY(-4px) rotate(-1.2deg);
    z-index: 1;
  }

  .patches li:nth-child(even) .patch:hover {
    transform: translateY(-4px) rotate(1.2deg);
  }

  .patch:hover .glyph {
    opacity: 0.32;
    rotate: 4deg;
    scale: 1.12;
  }

  .patch:active {
    transform: translateY(-1px) scale(0.98);
  }

  .patch:focus-visible {
    box-shadow:
      inset 0 0 0 3px #ffffff,
      inset 0 0 0 5px #1e1e1e;
    outline: none;
  }

  /* "Your recipes", lettered on the card like the headline, before the grey patches. */
  .label {
    color: #f3f3f2;
    font-size: clamp(1.05rem, 1.6vw, 1.35rem);
    font-stretch: 125%;
    font-weight: 750;
    letter-spacing: -0.02em;
    line-height: 1.05;
    padding: 1rem 0.4rem 0.2rem;
  }

  @media (min-width: 640px) {
    .label {
      grid-column: auto;
      padding: 1rem 1.1rem;
    }
  }

  /*
   * The opening, once per visit: the headline stretches from condensed to
   * expanded, as if resized, then the patches develop like prints in the
   * tray, from a pale grey into their colors.
   */
  .intro h1 span {
    animation: stretch 900ms var(--ease) both;
    animation-delay: calc(var(--line, 0) * 70ms);
  }

  .intro h1 span:nth-child(2) {
    --line: 1;
  }

  .intro h1 span:nth-child(3) {
    --line: 2;
  }

  @keyframes stretch {
    from {
      font-stretch: 62%;
      opacity: 0;
    }
    35% {
      opacity: 1;
    }
  }

  .intro .lead,
  .intro .lightbox {
    animation: rise 600ms var(--ease) both;
    animation-delay: 300ms;
  }

  .intro .patches li {
    animation: develop 900ms var(--ease) both;
    animation-delay: calc(var(--i) * 50ms + 380ms);
  }

  @keyframes develop {
    0% {
      filter: grayscale(1) brightness(1.7) contrast(0.45);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
  }
</style>
