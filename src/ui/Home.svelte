<!--
  The home page: the images loaded so far (they carry into whichever tool is
  opened), every tool, and the saved recipes.
-->
<script lang="ts">
  import { recipes } from '../app/recipes.svelte';
  import { session } from '../app/session.svelte';
  import { TOOLS } from '../app/tools';
  import { findOp } from '../ops';
  import FilePicker from './FilePicker.svelte';

  let picker: FilePicker;

  const count = $derived(session.items.length);
</script>

<div class="home">
  <p class="muted">Image tools that run entirely in your browser. Nothing is uploaded.</p>

  <section class="row">
    <span
      >{count === 0
        ? 'No images loaded.'
        : `${count} ${count === 1 ? 'image' : 'images'} loaded.`}</span
    >
    <button type="button" onclick={() => picker.open()}>
      {count ? 'Add images' : 'Choose images'}
    </button>
    {#if count}
      <button type="button" onclick={() => session.clearFiles()}>Clear</button>
    {/if}
    <span class="hint">You can also drop or paste images anywhere.</span>
    <FilePicker bind:this={picker} />
  </section>

  <section>
    <h2>Tools</h2>
    <ul>
      {#each TOOLS as tool (tool.id)}
        <li>
          <a href="#/tool/{tool.id}">{tool.title}</a>
          <span class="muted">— {tool.description}</span>
        </li>
      {/each}
    </ul>
  </section>

  {#if recipes.list.length}
    <section>
      <h2>Saved recipes</h2>
      <ul>
        {#each recipes.list as recipe (recipe.id)}
          <li>
            <a href="#/recipe/{recipe.id}">{recipe.title}</a>
            <span class="muted">
              — {recipe.steps.length === 0
                ? 'Export only'
                : recipe.steps.map((step) => findOp(step.op)?.title ?? step.op).join(' → ')}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .home {
    display: grid;
    gap: 1.25rem;
    max-width: 50rem;
  }

  ul {
    display: grid;
    gap: 0.35rem;
    margin: 0.5rem 0 0;
    padding-left: 1.2rem;
  }
</style>
