<!--
  The whole app on one page: the images, the history and the tools on the
  left; the live preview and what a final tool made on the right.
-->
<script lang="ts">
  import { session } from "../app/session.svelte";
  import DropOverlay from "./DropOverlay.svelte";
  import History from "./History.svelte";
  import ImageList from "./ImageList.svelte";
  import Outputs from "./Outputs.svelte";
  import Preview from "./Preview.svelte";
  import ToolPanel from "./ToolPanel.svelte";
</script>

<svelte:window
  onkeydown={(event) => {
    // Undo/redo, unless typing in a field (which has its own undo).
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
      return;
    const target = event.target as HTMLElement;
    if (target.matches("input, textarea, select")) return;
    event.preventDefault();
    if (event.shiftKey) session.redo();
    else session.undo();
  }}
/>

<header>
  <strong>ImageLab</strong>
  <span class="muted"
    >Image tools that run in your browser. Nothing is uploaded.</span
  >
</header>

<main>
  <div class="controls">
    <ImageList />
    {#if session.failures.length}
      <div class="notice error" role="alert">
        <div class="row">
          <strong>Something went wrong:</strong>
          <button
            class="icon"
            type="button"
            aria-label="Dismiss"
            onclick={() => session.dismissFailures()}>×</button
          >
        </div>
        <ul>
          {#each session.failures as failure, index (index)}
            <li>{failure.name}: {failure.message}</li>
          {/each}
        </ul>
      </div>
    {/if}
    <History />
    <ToolPanel />
  </div>

  <div class="stage">
    <Preview />
    <Outputs />
  </div>
</main>

<DropOverlay />

<style>
  header {
    align-items: baseline;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    padding: 0.6rem 1rem;
  }

  main {
    align-items: start;
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
    margin: 0 auto;
    max-width: 90rem;
    padding: 1rem 1rem 3rem;
  }

  @media (min-width: 900px) {
    main {
      grid-template-columns: minmax(20rem, 26rem) minmax(0, 1fr);
    }

    /* The preview stays in view while the settings scroll. */
    .stage {
      position: sticky;
      top: 1rem;
    }
  }

  .controls,
  .stage {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .notice ul {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
  }

  .notice .row {
    justify-content: space-between;
  }
</style>
