<!--
  The whole app on one page: the images, the chain of steps and the run
  button on the left; the live preview and the results on the right.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import AddStep from './AddStep.svelte';
  import DropOverlay from './DropOverlay.svelte';
  import FileTray from './FileTray.svelte';
  import Preview from './Preview.svelte';
  import Results from './Results.svelte';
  import StepCard from './StepCard.svelte';

  let view = $state<'preview' | 'results'>('preview');

  const runLabel = $derived.by(() => {
    const count = session.usable.length;
    const verb = session.merges ? 'Merge' : 'Process';
    if (count === 0) return `${verb} images`;
    return count === 1 ? `${verb} 1 image` : `${verb} ${count} images`;
  });

  function run(): void {
    view = 'results';
    void session.run();
  }
</script>

<header>
  <strong>ImageLab</strong>
  <span class="muted">Image tools that run in your browser. Nothing is uploaded.</span>
</header>

<main>
  <div class="controls">
    <FileTray />
    {#each session.steps as step, index (step.id)}
      <StepCard {index} />
    {/each}
    <AddStep />

    <div class="run">
      {#if session.running}
        <div class="row">
          <progress value={session.progress.done} max={Math.max(1, session.progress.total)}
          ></progress>
          <span>{session.progress.done} of {session.progress.total} done</span>
          <button type="button" onclick={() => session.cancel()}>Cancel</button>
        </div>
      {:else}
        <button class="primary" type="button" disabled={Boolean(session.blocker)} onclick={run}>
          {runLabel}
        </button>
        {#if session.blocker}<p class="hint">{session.blocker}</p>{/if}
      {/if}
    </div>
  </div>

  <div class="stage">
    <div class="row" role="group" aria-label="View">
      <button type="button" aria-pressed={view === 'preview'} onclick={() => (view = 'preview')}>
        Preview
      </button>
      <button type="button" aria-pressed={view === 'results'} onclick={() => (view = 'results')}>
        Results{session.results.length ? ` (${session.results.length})` : ''}
      </button>
    </div>
    {#if view === 'preview'}
      <Preview />
    {:else}
      <Results />
    {/if}
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

  .run {
    display: grid;
    gap: 0.4rem;
  }

  .run .primary {
    padding: 0.5rem;
  }

  progress {
    flex: 1;
  }

  [aria-pressed='true'] {
    border-color: var(--ink);
    font-weight: 600;
  }
</style>
