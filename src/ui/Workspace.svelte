<!--
  The workspace for a tool or saved recipe: the images, the chain of steps
  and the run button on the left; the live preview and the results on the
  right. The chain is remembered per tool (or saved into the recipe) as it
  changes.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import {
    forgetToolRecipe,
    recipes,
    saveToolRecipe,
    toolDefaults,
    toolRecipe,
    type SavedRecipe,
  } from '../app/recipes.svelte';
  import { router } from '../app/router.svelte';
  import { session } from '../app/session.svelte';
  import type { Op } from '../ops/op';
  import AddStep from './AddStep.svelte';
  import FileTray from './FileTray.svelte';
  import Preview from './Preview.svelte';
  import Results from './Results.svelte';
  import StepCard from './StepCard.svelte';

  let { tool, recipe }: { tool?: Op; recipe?: SavedRecipe } = $props();

  const title = $derived(tool?.title ?? recipe?.title ?? '');
  let view = $state<'preview' | 'results'>('preview');

  // Load the recipe when the route changes (files stay). Only which tool or
  // recipe is open counts: its contents change as the settings are saved.
  $effect.pre(() => {
    const [openTool, openRecipe] = [tool, recipe];
    untrack(() => {
      if (openTool) session.open(toolRecipe(openTool));
      else if (openRecipe) session.open(structuredClone($state.snapshot(openRecipe.steps)));
      view = 'preview';
    });
  });

  // Remember the chain as it changes. Saving reads the stored recipes, so
  // it's untracked: otherwise writing the recipe would re-run this effect forever.
  $effect(() => {
    const steps = $state.snapshot(session.steps);
    untrack(() => {
      if (tool) saveToolRecipe(tool.id, steps);
      else if (recipe) recipes.update(recipe.id, steps);
    });
  });

  function run(): void {
    view = 'results';
    void session.run();
  }

  function reset(): void {
    if (!tool) return;
    forgetToolRecipe(tool.id);
    session.open(toolDefaults(tool));
  }

  function saveRecipe(): void {
    const name = prompt('Save this chain of steps as a recipe named:', title)?.trim();
    if (!name) return;
    const saved = recipes.add(name.slice(0, 60), $state.snapshot(session.steps));
    router.go({ page: 'recipe', id: saved.id });
  }

  function deleteRecipe(): void {
    if (!recipe || !confirm(`Delete the recipe “${recipe.title}”?`)) return;
    recipes.remove(recipe.id);
    router.go({ page: 'home' });
  }

  const runLabel = $derived.by(() => {
    const count = session.items.filter((item) => !item.error).length;
    if (session.merges) return count === 0 ? 'Merge images' : `Merge ${count} images`;
    if (count === 0) return 'Process images';
    return count === 1 ? 'Process 1 image' : `Process ${count} images`;
  });
</script>

<div class="workspace">
  <header class="row">
    <div class="heading">
      <h1>{title}</h1>
      <p class="muted">{tool?.description ?? 'Saved recipe.'}</p>
    </div>
    {#if tool}
      <button type="button" onclick={reset}>Start over</button>
    {:else}
      <button class="danger" type="button" onclick={deleteRecipe}>Delete recipe</button>
    {/if}
    <button type="button" onclick={saveRecipe}>Save as recipe…</button>
  </header>

  <div class="columns">
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
  </div>
</div>

<style>
  .workspace {
    display: grid;
    gap: 1rem;
  }

  .heading {
    flex: 1;
    min-width: 12rem;
  }

  .columns {
    align-items: start;
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 900px) {
    .columns {
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
