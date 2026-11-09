<!--
  A tool's page: the viewer (or the crop box) as large as the screen allows,
  the images under it, and the settings, Apply and the results beside it on
  a wide screen, below it on a phone, where the viewer stays in view at the
  top and Apply stays at the bottom. Images are loaded only on the home
  page: without any, the tool is shown greyed out and disabled, with a way
  back to load them.
-->
<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";

  import { goHome } from "../app/router";
  import { session } from "../app/session.svelte";
  import CropEditor from "./CropEditor.svelte";
  import Failures from "./Failures.svelte";
  import Filmstrip from "./Filmstrip.svelte";
  import { TOOL_LOOKS } from "./tools";
  import ParamForm from "./ParamForm.svelte";
  import Results from "./Results.svelte";
  import Viewer from "./Viewer.svelte";

  let { op }: { op: NonNullable<typeof session.op> } = $props();

  const count = $derived(session.items.length);
  const look = $derived(TOOL_LOOKS[op.id]);
  const applyLabel = $derived.by(() => {
    if (count === 0) return "Apply";
    const images = count === 1 ? "1 image" : `${count} images`;
    return op.kind === "combine" ? `Merge ${images}` : `Apply to ${images}`;
  });
</script>

<!-- The tool's color is the accent of everything on its screen. -->
<div class="screen" style:--accent={look.color} style:--accent-soft={look.soft}>
  <header class="bar">
    <button class="quiet back" type="button" onclick={goHome}>
      <ArrowLeft size={18} /> Tools
    </button>
    <h1>
      <span class="glyph"><look.icon size={18} /></span>
      {op.title}
    </h1>
  </header>

  <div class="stage">
    {#if count === 0}
      <div class="empty">
        {#if session.reading}
          <p class="muted">Reading images…</p>
        {:else}
          <p class="empty-title">No images yet</p>
          <p class="muted">
            {op.title} works on the images you load on the home page.
          </p>
          <button class="primary" type="button" onclick={goHome}>
            <ArrowLeft size={18} /> Go back and add images
          </button>
        {/if}
      </div>
    {:else if op.id === "transform"}
      <CropEditor />
    {:else}
      <Viewer />
    {/if}
  </div>

  {#if count}
    <div class="strip"><Filmstrip /></div>
  {/if}

  <aside
    class="panel"
    class:off={count === 0}
    inert={count === 0}
    aria-label="Settings"
  >
    <div class="settings">
      <p class="muted">{op.description}</p>

      {#if op.id === "strip-metadata" && session.selected}
        {@const { version } = session.selected}
        {#if version.metadata.length}
          <div class="hint">
            In {version.name}:
            <ul class="bullets">
              {#each version.metadata as entry (entry)}<li>{entry}</li>{/each}
            </ul>
          </div>
        {:else}
          <p class="hint">No metadata in {version.name}.</p>
        {/if}
      {/if}
      {#if session.tool}
        <ParamForm
          schema={op.params}
          values={session.tool.params}
          idPrefix={op.id}
          onchange={(key, value) => session.setParam(key, value)}
          picking={session.picking}
          onpick={(key) =>
            (session.picking = session.picking === key ? null : key)}
        />
      {/if}
      <Failures />
      <Results />
    </div>

    <div class="apply">
      {#if session.running}
        <div class="progress">
          <progress
            value={session.progress.done}
            max={Math.max(1, session.progress.total)}
          ></progress>
          <span class="hint numbers">
            {session.progress.done} of {session.progress.total}
          </span>
          <button type="button" onclick={() => session.cancel()}>Cancel</button>
        </div>
      {:else}
        <button
          class="primary"
          type="button"
          disabled={count === 0}
          onclick={() => session.apply()}
        >
          {applyLabel}
        </button>
      {/if}
    </div>
  </aside>
</div>

<style>
  /* Phone first: one column; the viewer sticks to the top, Apply to the bottom. */
  .screen {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .empty {
    align-content: center;
    background: var(--stage);
    display: grid;
    gap: 0.6rem;
    height: 100%;
    justify-items: center;
    padding: 1.5rem;
    text-align: center;
  }

  .empty-title {
    font-size: var(--text-title);
    font-stretch: 85%;
    font-weight: 600;
  }

  .empty .primary {
    margin-top: 0.5rem;
    padding-inline: 1.1rem;
  }

  /*
   * No images: the tool is there to look at, greyed out, but does nothing.
   * The settings fade; the Apply bar stays solid (its button is greyed as
   * disabled), to hide what scrolls under it.
   */
  .off .settings {
    filter: grayscale(1);
    opacity: 0.5;
  }

  .bar {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem calc(var(--gutter) - 0.5rem);
  }

  .back {
    color: var(--muted);
    padding-left: 0.5rem;
  }

  h1 {
    align-items: center;
    display: flex;
    font-size: var(--text-lead);
    gap: 0.45rem;
    min-width: 0;
  }

  .glyph {
    background: var(--accent-soft);
    border-radius: 8px;
    color: var(--accent);
    display: grid;
    flex: none;
    height: 2rem;
    place-items: center;
    width: 2rem;
  }

  .stage {
    height: 46svh;
    position: sticky;
    top: env(safe-area-inset-top);
    z-index: 1;
  }

  .strip {
    padding: 0.75rem var(--gutter) 0;
  }

  .panel {
    display: grid;
  }

  .settings {
    align-content: start;
    display: grid;
    gap: 1.25rem;
    padding: 1rem var(--gutter) 1.5rem;
  }

  .bullets {
    margin: 0.25rem 0 0;
    padding-left: 1.1rem;
  }

  .apply {
    background: color-mix(in oklab, var(--page) 92%, transparent);
    backdrop-filter: blur(8px);
    bottom: 0;
    padding: 0.75rem var(--gutter) max(0.75rem, env(safe-area-inset-bottom));
    position: sticky;
  }

  .apply .primary {
    width: 100%;
  }

  .progress {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    min-height: 2.75rem;
  }

  progress {
    accent-color: var(--accent);
    flex: 1;
  }

  /* Wide: the viewer fills the screen, the settings get a column of their own. */
  @media (min-width: 900px) {
    .screen {
      grid-template-areas:
        "bar panel"
        "stage panel"
        "strip panel";
      grid-template-columns: minmax(0, 1fr) 23rem;
      grid-template-rows: auto minmax(0, 1fr) auto;
      height: calc(100dvh - env(safe-area-inset-top));
    }

    .bar {
      grid-area: bar;
    }

    .stage {
      border-radius: calc(var(--radius) * 1.5);
      grid-area: stage;
      height: auto;
      margin-left: var(--gutter);
      overflow: hidden;
      position: static;
    }

    .strip {
      grid-area: strip;
      padding: 0.75rem var(--gutter) max(0.5rem, env(safe-area-inset-bottom));
    }

    .panel {
      background: var(--sheet);
      grid-area: panel;
      grid-template-rows: minmax(0, 1fr) auto;
      margin: var(--gutter) var(--gutter)
        max(var(--gutter), env(safe-area-inset-bottom));
      border-radius: calc(var(--radius) * 1.5);
      min-height: 0;
      overflow: hidden;
    }

    .settings {
      overflow-y: auto;
      padding: 1.25rem;
    }

    .apply {
      background: var(--sheet);
      backdrop-filter: none;
      padding: 1rem 1.25rem 1.25rem;
    }
  }
</style>
