<!--
  The workspace for a tool or saved recipe. On the left, the recipe is one
  process sheet (images, steps, export) whose sections hang on a rail that
  flows while a batch runs, with the run button kept in reach at the bottom;
  on the right,
  the live preview and the results. Settings are remembered per tool (or saved
  into the recipe) as they change.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';

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
  import { ms } from './motion';
  import { NEUTRAL, patchOf } from './patches';
  import Preview from './Preview.svelte';
  import Results from './Results.svelte';
  import StepCard from './StepCard.svelte';
  import Tile from './Tile.svelte';

  let { tool, recipe }: { tool?: Tool; recipe?: SavedRecipe } = $props();

  const title = $derived(tool?.title ?? recipe?.title ?? '');
  /** The tool's chart patch; its color marks the run's progress. */
  const patch = $derived(tool ? patchOf(tool.icon) : NEUTRAL.recipe);
  let view = $state<'preview' | 'results'>('preview');
  let saveDialog: HTMLDialogElement;
  let recipeName = $state('');

  // Load the recipe when the route changes (files stay). Only which tool or
  // recipe is open counts: its contents change as the settings are saved.
  $effect.pre(() => {
    const [openTool, openRecipe] = [tool, recipe];
    untrack(() => {
      if (openTool) {
        const loaded = toolRecipe(openTool);
        session.open(loaded.steps, loaded.export, openTool.suffix);
      } else if (openRecipe) {
        session.open(structuredClone($state.snapshot(openRecipe.steps)), { ...openRecipe.export });
      }
      view = 'preview';
    });
  });

  // Remember the settings as they change. Saving reads the stored recipes, so
  // it's untracked: otherwise writing the recipe would re-run this effect forever.
  $effect(() => {
    const steps = $state.snapshot(session.steps);
    const settings = $state.snapshot(session.exportSettings);
    untrack(() => {
      if (tool) saveToolRecipe(tool.id, { steps, export: settings });
      else if (recipe) recipes.update(recipe.id, steps, settings);
    });
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

  function openSaveDialog(): void {
    recipeName = title;
    saveDialog.showModal();
  }

  const runLabel = $derived.by(() => {
    const count = session.items.filter((item) => !item.error).length;
    if (session.merges) return count === 0 ? 'Merge images' : `Merge ${count} images`;
    if (count === 0) return 'Process images';
    return count === 1 ? 'Process 1 image' : `Process ${count} images`;
  });
</script>

<div
  class="workspace page"
  style:--tool={patch.color}
  style:--tool-ink={patch.ink === 'light' ? '#ffffff' : '#1e1e1e'}
  style:--slider={patch.color}
>
  <!-- The tool's patch, grown into a banner: the home page's patch morphs into it. -->
  <header
    class="banner ink-{patch.ink}"
    style:--patch={patch.color}
    style:view-transition-name={tool ? `tool-${tool.id}` : `recipe-${recipe?.id}`}
    style:view-transition-class="patch"
  >
    <a class="back" href="#/" aria-label="All tools"><Icon name="back" /></a>
    <div class="heading">
      <h1>{title}</h1>
      <p>{tool?.description ?? 'Your saved recipe.'}</p>
    </div>
    <div class="title-actions">
      {#if tool}
        <button class="button small on-patch" type="button" onclick={reset}>
          <Icon name="reload" size={16} />Reset
        </button>
      {:else}
        <button class="button small on-patch" type="button" onclick={deleteRecipe}>
          <Icon name="trash" size={16} />Delete
        </button>
      {/if}
      <button class="button small on-patch" type="button" onclick={openSaveDialog}>
        <Icon name="save" size={16} />Save as recipe
      </button>
    </div>
    <span class="glyph" aria-hidden="true"><Icon name={tool?.icon ?? 'sparkles'} size={220} /></span
    >
  </header>

  <div class="columns">
    <div class="controls">
      <div class="flow" class:running={session.running} aria-label="Recipe" role="group">
        <FileTray />
        {#each session.steps as step, index (step.id)}
          <div
            animate:flip={{ duration: ms(280) }}
            in:fly={{ y: -12, duration: ms(320) }}
            out:fade={{ duration: ms(140) }}
          >
            <StepCard {index} />
          </div>
        {/each}
        <AddStep />
        <ExportCard />
      </div>

      <div class="run" class:busy={session.running}>
        {#if session.running}
          <div class="progress" aria-live="polite">
            <span class="progress-label">
              <span class="spinner"></span>
              Processing… {session.progress.done} of {session.progress.total} done
            </span>
            <span class="track">
              <span
                class="fill"
                style:width="{(session.progress.done / Math.max(1, session.progress.total)) * 100}%"
              ></span>
            </span>
          </div>
          <button class="button small on-dock" type="button" onclick={() => session.cancel()}>
            <Icon name="stop" size={16} />Cancel
          </button>
        {:else}
          <button class="button go" type="button" disabled={Boolean(session.blocker)} onclick={run}>
            <Icon name="play" size={16} />{runLabel}
          </button>
          {#if session.blocker}<span class="hint blocker">{session.blocker}</span>{/if}
        {/if}
      </div>
    </div>

    <!-- On phones the images come first; the preview stays pinned while the settings scroll under it. -->
    <div
      class="stage"
      class:first={session.items.length > 0}
      class:pinned={view === 'preview' && session.items.length > 0}
    >
      <div class="tabs" role="group" aria-label="View" style:--index={view === 'preview' ? 0 : 1}>
        <span class="thumb" aria-hidden="true"></span>
        <button type="button" aria-pressed={view === 'preview'} onclick={() => (view = 'preview')}>
          <Icon name="image" size={15} />Preview
        </button>
        <button type="button" aria-pressed={view === 'results'} onclick={() => (view = 'results')}>
          <Icon name="download" size={15} />Results
          {#if session.results.length}
            {#key session.results.length}
              <span class="badge">{session.results.length}</span>
            {/key}
          {/if}
        </button>
      </div>
      {#key view}
        <div class="view" in:fade={{ duration: ms(180) }}>
          {#if view === 'preview'}
            <Preview />
          {:else}
            <Results />
          {/if}
        </div>
      {/key}
    </div>
  </div>
</div>

<dialog bind:this={saveDialog} class="panel dialog">
  <form onsubmit={saveRecipe} class="fields">
    <div class="dialog-head">
      <Tile icon="sparkles" patch={NEUTRAL.recipe} />
      <h2>Save as recipe</h2>
    </div>
    <p class="hint">
      Keeps these steps and export settings under a name of your own, on the home page.
    </p>
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" bind:value={recipeName} maxlength="60" required />
    </label>
    <div class="dialog-actions">
      <button class="button ghost" type="button" onclick={() => saveDialog.close()}>Cancel</button>
      <button class="button primary" type="submit">Save recipe</button>
    </div>
  </form>
</dialog>

<style>
  .workspace {
    display: grid;
    gap: 1.5rem;
  }

  /*
   * The banner: the tool's chart patch at full width, its name in big
   * expanded type and its pictogram, giant and tone on tone, off the edge.
   */
  .banner {
    align-items: center;
    background: var(--patch);
    border-radius: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 1.25rem;
    min-height: 8.5rem;
    overflow: hidden;
    padding: clamp(1.1rem, 2.5vw, 1.6rem) clamp(1.1rem, 3vw, 2rem);
    position: relative;
  }

  .banner > :not(.glyph) {
    position: relative;
    z-index: 1;
  }

  .heading {
    display: grid;
    flex: 1;
    gap: 0.35rem;
    min-width: 12rem;
  }

  h1 {
    font-size: clamp(1.7rem, 4.2vw, 3rem);
    font-stretch: 125%;
    font-weight: 780;
    letter-spacing: -0.035em;
    line-height: 0.98;
  }

  .heading p {
    font-size: clamp(0.92rem, 1.3vw, 1.02rem);
    max-width: 52ch;
    opacity: 0.86;
  }

  /* Between the title and the actions on wide screens, so neither sits on it. */
  .glyph {
    display: flex;
    opacity: 0.17;
    pointer-events: none;
    position: absolute;
    right: -2.5rem;
    rotate: -12deg;
    top: 50%;
    translate: 0 -46%;
  }

  @media (min-width: 960px) {
    .glyph {
      right: clamp(14rem, 24vw, 22rem);
    }
  }

  @media (max-width: 639px) {
    .glyph {
      right: -3.25rem;
      top: auto;
      bottom: -3rem;
      translate: none;
    }

    .glyph :global(svg) {
      height: 150px;
      width: 150px;
    }
  }

  .back {
    align-items: center;
    align-self: flex-start;
    border: 1.5px solid color-mix(in srgb, currentColor 40%, transparent);
    border-radius: 50%;
    color: inherit;
    display: flex;
    flex: none;
    height: 2.6rem;
    justify-content: center;
    transition:
      background 160ms var(--ease),
      border-color 160ms var(--ease);
    width: 2.6rem;
  }

  .back:hover {
    background: color-mix(in srgb, currentColor 14%, transparent);
    border-color: currentColor;
  }

  .back:hover :global(svg) {
    animation: nudge 500ms var(--ease);
  }

  .back:focus-visible {
    outline-color: currentColor;
  }

  @keyframes nudge {
    40% {
      transform: translateX(-3px);
    }
  }

  .title-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  /* Buttons printed on the patch take its ink. */
  .on-patch {
    background: transparent;
    border-color: color-mix(in srgb, currentColor 40%, transparent);
    color: inherit;
  }

  .on-patch:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 14%, transparent);
    border-color: currentColor;
  }

  .on-patch:focus-visible {
    outline-color: currentColor;
  }

  .columns {
    align-items: start;
    display: grid;
    gap: 1.5rem;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 960px) {
    .columns {
      gap: 2rem;
      grid-template-columns: minmax(22rem, 27rem) minmax(0, 1fr);
    }

    .stage {
      position: sticky;
      top: 1rem;
    }
  }

  .controls,
  .stage {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  /*
   * The process sheet: one sheet for the whole recipe, its sections ruled
   * off, and a rail down the left joining the sections' patches. While a
   * batch runs, the rail turns the tool's color and its dashes flow down.
   */
  .flow {
    --pad: 1.15rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: grid;
    padding: 0 var(--pad) 0.6rem;
    position: relative;
  }

  /*
   * Each section draws its own piece of the rail, so it starts at the first
   * patch and ends at the last one, however tall the sections are.
   */
  .flow > :global(*)::before {
    background: color-mix(in srgb, var(--ink) 22%, transparent);
    bottom: 0;
    content: '';
    left: calc(1rem - 1.5px);
    position: absolute;
    top: 0;
    width: 3px;
  }

  .flow > :global(:first-child)::before {
    top: 2.15rem;
  }

  .flow > :global(:last-child)::before {
    bottom: auto;
    height: 2.15rem;
  }

  .flow.running > :global(*)::before {
    animation: flow 500ms linear infinite;
    background: repeating-linear-gradient(to bottom, var(--tool) 0 6px, transparent 6px 10px);
  }

  @keyframes flow {
    to {
      background-position: 0 10px;
    }
  }

  .flow > :global(*) {
    position: relative;
  }

  /* Sections are ruled off from the content column, so the rule never crosses the rail. */
  .flow > :global(* + *:not(.add))::after {
    border-top: 1px solid var(--border);
    content: '';
    left: 2.85rem;
    position: absolute;
    right: 0;
    top: 0;
  }

  .flow > :global(.add + *)::after {
    display: none;
  }

  /*
   * The run button sits in a dark dock that floats at the bottom of the
   * screen; the button itself is the tool's color.
   */
  .run {
    align-items: center;
    background: color-mix(in srgb, var(--frame) 94%, transparent);
    border-radius: 16px;
    bottom: 0.75rem;
    box-shadow:
      0 0 0 1px light-dark(transparent, #333333),
      0 18px 40px -14px rgb(0 0 0 / 0.55);
    color: #f3f3f2;
    color-scheme: dark;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.4rem;
    position: sticky;
    z-index: 5;
  }

  .run .go {
    background: var(--tool);
    border-color: transparent;
    border-radius: 11px;
    color: var(--tool-ink);
    flex: 1;
    font-size: 1rem;
    font-weight: 700;
    min-height: 3.1rem;
  }

  .run .go:hover:not(:disabled) {
    background: var(--tool);
    border-color: transparent;
    filter: brightness(1.07);
  }

  .run .go:disabled {
    background: #3a3a3a;
    color: #a9a9a5;
    opacity: 1;
  }

  .run .go:not(:disabled) :global(svg) {
    transition: transform 300ms var(--spring);
  }

  .run .go:hover:not(:disabled) :global(svg) {
    transform: scale(1.25);
  }

  .on-dock {
    background: transparent;
    border-color: #555555;
    color: inherit;
  }

  .on-dock:hover:not(:disabled) {
    background: #333333;
  }

  .blocker {
    color: #a9a9a5;
    padding: 0 0.5rem 0.25rem;
    width: 100%;
  }

  .progress {
    display: grid;
    flex: 1;
    gap: 0.45rem;
    padding: 0.35rem 0.6rem;
  }

  .progress-label {
    align-items: center;
    display: flex;
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    gap: 0.5rem;
  }

  .track {
    background: #3a3a3a;
    border-radius: 999px;
    height: 6px;
    overflow: hidden;
  }

  .fill {
    background: var(--tool);
    border-radius: inherit;
    display: block;
    height: 100%;
    min-width: 6px;
    transition: width 400ms var(--ease);
  }

  /*
   * Phones: the preview comes first and stays pinned to the top while the
   * settings scroll under it, so a change shows as it's made.
   */
  @media (max-width: 959px) {
    .stage.first {
      order: -1;
    }

    .stage.pinned {
      background: var(--surface);
      box-shadow: 0 14px 18px -16px rgb(0 0 0 / 0.5);
      margin-inline: -1.25rem;
      padding: 0.6rem 1.25rem 0.75rem;
      position: sticky;
      top: 0;
      z-index: 6;
    }

    .stage.pinned :global(.stage) {
      min-height: 0;
      padding: 0.75rem;
    }

    .stage.pinned :global(canvas) {
      max-height: 34vh;
    }

    .stage.pinned :global(.metadata),
    .stage.pinned :global(.preview > .hint) {
      display: none;
    }
  }

  /* Preview / Results: a two-way switch with a sliding thumb. */
  .tabs {
    background: var(--panel-subtle);
    border: 1px solid var(--border);
    border-radius: 10px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    justify-self: start;
    padding: 0.2rem;
    position: relative;
  }

  .tabs .thumb {
    background: var(--panel);
    border-radius: 7px;
    box-shadow:
      var(--shadow-sm),
      0 0 0 1px var(--border-strong);
    inset: 0.2rem auto 0.2rem 0.2rem;
    position: absolute;
    transform: translateX(calc(var(--index) * 100%));
    transition: transform 320ms var(--spring);
    width: calc(50% - 0.2rem);
  }

  .tabs button {
    align-items: center;
    background: none;
    border: 0;
    color: var(--muted);
    display: flex;
    font-size: 0.86rem;
    font-weight: 600;
    gap: 0.4rem;
    justify-content: center;
    min-height: 2.1rem;
    padding: 0.25rem 1rem;
    position: relative;
    transition: color 200ms var(--ease);
  }

  .tabs button[aria-pressed='true'] {
    color: var(--ink);
  }

  .tabs .badge {
    animation: pop 420ms var(--ease);
  }

  .view {
    min-width: 0;
  }

  .dialog {
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    color: var(--ink);
    max-width: min(26rem, calc(100vw - 2rem));
    padding: 1.4rem;
    width: 100%;
  }

  .dialog[open] {
    animation: dialog-in 260ms var(--spring);
  }

  .dialog::backdrop {
    backdrop-filter: blur(4px);
    background: rgb(0 0 0 / 0.35);
  }

  @keyframes dialog-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.96);
    }
  }

  .dialog-head {
    align-items: center;
    display: flex;
    gap: 0.75rem;
  }

  .dialog-head h2 {
    font-size: 1.2rem;
  }

  .dialog-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
