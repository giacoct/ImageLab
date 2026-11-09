<!--
  The home page: the only place images come in (choosing, dropping or
  pasting them), and the list of tools, each a page of its own. A tool can
  be opened first; without images it waits for you to come back here.
-->
<script lang="ts">
  import { chooseImages } from "../app/picker";
  import { toolHref } from "../app/router";
  import { session } from "../app/session.svelte";
  import { OPS } from "../ops";
  import DropOverlay from "./DropOverlay.svelte";
  import Failures from "./Failures.svelte";
  import Filmstrip from "./Filmstrip.svelte";
  import { TOOL_LOOKS } from "./tools";

  const count = $derived(session.items.length);
</script>

<div class="home">
  <header>
    <span class="wordmark">ImageLab</span>
    <span class="hint">Everything stays in your browser.</span>
  </header>

  <main>
    <section class="intake" aria-labelledby="intake-title">
      {#if count === 0}
        <h1 id="intake-title" class="display">Drop images here</h1>
        <p class="lead muted">
          Or paste them, or choose them from your device. JPEG, PNG, WebP, AVIF,
          GIF and HEIC.
        </p>
        <div>
          <button class="primary" type="button" onclick={chooseImages}>
            Choose images
          </button>
        </div>
        {#if session.reading}
          <p class="hint">Reading {session.reading}…</p>
        {/if}
      {:else}
        <h1 id="intake-title" class="display">
          {count === 1 ? "1 image" : `${count} images`}
        </h1>
        <Filmstrip editable />
      {/if}
      <Failures />
    </section>

    <section class="tools" aria-labelledby="tools-title">
      <h2 id="tools-title">
        {count ? "Pick a tool" : "Then pick a tool"}
      </h2>
      <ul>
        {#each OPS as op (op.id)}
          {@const look = TOOL_LOOKS[op.id]}
          <li>
            <a
              href={toolHref(op.id)}
              style:--tool={look.color}
              style:--tool-soft={look.soft}
            >
              <span class="glyph"><look.icon size={20} /></span>
              <span class="text">
                <span class="title">{op.title}</span>
                <span class="hint">{op.description}</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  </main>
</div>

<DropOverlay />

<style>
  .home {
    margin: 0 auto;
    max-width: 68rem;
    padding: 0 var(--gutter) calc(4rem + env(safe-area-inset-bottom));
  }

  header {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.9rem;
    padding: 1.1rem 0;
  }

  .wordmark {
    font-size: var(--text-lead);
    font-stretch: 85%;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  main {
    display: grid;
    gap: 2.5rem;
  }

  /*
   * The one bold thing on the page: the invitation to drop images, topped
   * with a stripe of all the tools' colors.
   */
  .intake {
    background: var(--sheet);
    border-radius: calc(var(--radius) * 2);
    display: grid;
    gap: 1rem;
    overflow: hidden;
    padding: clamp(1.5rem, 5vw, 3rem);
    position: relative;
  }

  .intake::before {
    background: var(--spectrum);
    content: "";
    height: 6px;
    inset: 0 0 auto;
    position: absolute;
  }

  .display {
    font-size: var(--text-display);
    font-stretch: 82%;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.02;
  }

  .lead {
    font-size: var(--text-lead);
    max-width: 34rem;
  }

  .tools {
    display: grid;
    gap: 0.75rem;
  }

  .tools h2 {
    font-size: var(--text-lead);
    padding: 0 0.75rem;
  }

  .tools ul {
    display: grid;
    gap: 0.25rem 1.5rem;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .tools a {
    align-items: start;
    border-radius: var(--radius);
    color: inherit;
    display: flex;
    gap: 0.85rem;
    padding: 0.7rem 0.75rem;
    text-decoration: none;
  }

  .tools a:hover {
    background: var(--tool-soft);
  }

  /* Each tool's icon on a tint of its own color. */
  .glyph {
    background: var(--tool-soft);
    border-radius: 10px;
    color: var(--tool);
    display: grid;
    flex: none;
    height: 2.5rem;
    place-items: center;
    width: 2.5rem;
  }

  .tools a:hover .glyph {
    background: var(--tool);
    color: #fff;
  }

  .text {
    display: grid;
    gap: 0.1rem;
    padding-top: 0.1rem;
  }

  .title {
    font-weight: 600;
  }
</style>
