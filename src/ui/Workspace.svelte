<!--
  The workspace for a tool or saved recipe: images, steps and export on the
  left; live preview and results on the right. Settings are remembered per
  tool (or saved into the recipe) as they change.
-->
<script lang="ts">
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
  import type { Tool } from '../app/tools';
  import AddStep from './AddStep.svelte';
  import ExportCard from './ExportCard.svelte';
  import FileTray from './FileTray.svelte';
  import Icon from './Icon.svelte';
  import Preview from './Preview.svelte';
  import Results from './Results.svelte';
  import StepCard from './StepCard.svelte';

  let { tool, recipe }: { tool?: Tool; recipe?: SavedRecipe } = $props();

  const title = $derived(tool?.title ?? recipe?.title ?? '');
  let view = $state<'preview' | 'results'>('preview');
  let saveDialog: HTMLDialogElement;
  let recipeName = $state('');

  // Load the recipe when the route changes (files stay).
  $effect.pre(() => {
    if (tool) {
      const loaded = toolRecipe(tool);
      session.open(loaded.steps, loaded.export, tool.suffix);
    } else if (recipe) {
      session.open(structuredClone($state.snapshot(recipe.steps)), { ...recipe.export });
    }
    view = 'preview';
  });

  // Remember the settings as they change.
  $effect(() => {
    const steps = $state.snapshot(session.steps);
    const settings = $state.snapshot(session.exportSettings);
    if (tool) saveToolRecipe(tool.id, { steps, export: settings });
    else if (recipe) recipes.update(recipe.id, steps, settings);
  });

  function run(): void {
    view = 'results';
    void session.run();
  }

  function reset(): void {
    if (!tool) return;
    forgetToolRecipe(tool.id);
    const preset = toolDefaults(tool);
    session.open(preset.steps, preset.export, tool.suffix);
  }

  function saveRecipe(event: SubmitEvent): void {
    event.preventDefault();
    const name = recipeName.trim();
    if (!name) return;
    const saved = recipes.add(
      name,
      $state.snapshot(session.steps),
      $state.snapshot(session.exportSettings),
    );
    saveDialog.close();
    router.go({ page: 'recipe', id: saved.id });
  }

  function deleteRecipe(): void {
    if (!recipe || !confirm(`Delete the recipe “${recipe.title}”?`)) return;
    recipes.remove(recipe.id);
    router.go({ page: 'home' });
  }

  const runLabel = $derived.by(() => {
    const count = session.items.filter((item) => !item.error).length;
    if (session.merges) return `Merge ${count} images`;
    return count === 1 ? 'Process 1 image' : `Process ${count} images`;
  });
</script>

<div class="workspace">
  <header class="title">
    <a class="icon-button back" href="#/" aria-label="All tools"><Icon name="back" /></a>
    <div>
      <h1>{title}</h1>
      <p class="muted">{tool?.description ?? 'Your saved recipe.'}</p>
    </div>
    <div class="title-actions">
      {#if tool}
        <button class="button small" type="button" onclick={reset}
          ><Icon name="reload" size={16} />Reset</button
        >
      {:else}
        <button class="button small danger" type="button" onclick={deleteRecipe}>
          <Icon name="trash" size={16} />Delete
        </button>
      {/if}
      <button
        class="button small"
        type="button"
        onclick={() => {
          recipeName = title;
          saveDialog.showModal();
        }}><Icon name="save" size={16} />Save as recipe</button
      >
    </div>
  </header>

  <div class="columns">
    <div class="controls">
      <FileTray />
      {#each session.steps as step, index (step.id)}
        <StepCard {index} />
      {/each}
      <AddStep />
      <ExportCard />

      <div class="run">
        {#if session.running}
          <button class="button" type="button" onclick={() => session.cancel()}>
            <Icon name="stop" size={16} />Cancel
          </button>
          <span class="muted">{session.progress.done} / {session.progress.total}</span>
        {:else}
          <button
            class="button primary"
            type="button"
            disabled={Boolean(session.blocker)}
            onclick={run}
          >
            <Icon name="play" size={16} />{runLabel}
          </button>
          {#if session.blocker}<span class="hint">{session.blocker}</span>{/if}
        {/if}
      </div>
    </div>

    <div class="stage">
      <div class="segmented tabs" role="group" aria-label="View">
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

<dialog bind:this={saveDialog} class="panel dialog">
  <form onsubmit={saveRecipe} class="fields">
    <h2 class="panel-title">Save as recipe</h2>
    <p class="hint">
      Keeps these steps and export settings under a name of your own, on the home page.
    </p>
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" bind:value={recipeName} maxlength="60" required />
    </label>
    <div class="dialog-actions">
      <button class="button" type="button" onclick={() => saveDialog.close()}>Cancel</button>
      <button class="button primary" type="submit">Save</button>
    </div>
  </form>
</dialog>

<style>
  .workspace {
    display: grid;
    gap: 1.25rem;
  }

  .title {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .title > div:nth-child(2) {
    flex: 1;
    min-width: 12rem;
  }

  h1 {
    font-size: 1.35rem;
  }

  .back {
    border: 1px solid var(--border);
  }

  .title-actions {
    display: flex;
    gap: 0.5rem;
  }

  .columns {
    align-items: start;
    display: grid;
    gap: 1.25rem;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 960px) {
    .columns {
      grid-template-columns: minmax(22rem, 26rem) minmax(0, 1fr);
    }

    .stage {
      position: sticky;
      top: 1rem;
    }
  }

  .controls,
  .stage {
    display: grid;
    gap: 0.85rem;
    min-width: 0;
  }

  .run {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .run .button {
    flex: 1;
    min-height: 2.8rem;
  }

  .tabs {
    justify-self: start;
  }

  .dialog {
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    color: var(--ink);
    max-width: min(26rem, calc(100vw - 2rem));
    width: 100%;
  }

  .dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }

  .dialog-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
