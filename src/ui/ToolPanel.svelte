<!--
  The tools: a list to pick one, then the open tool's settings (its generated
  form, plus the crop editor for "Rotate, flip & crop" and what "Strip
  metadata" will remove) and the button that applies it to every image.
-->
<script lang="ts">
  import { session } from "../app/session.svelte";
  import { OPS } from "../ops";
  import CropEditor from "./CropEditor.svelte";
  import ParamForm from "./ParamForm.svelte";

  const count = $derived(session.items.length);
  const applyLabel = $derived.by(() => {
    const op = session.op;
    const images = count === 1 ? "1 image" : `${count} images`;
    if (op?.kind === "combine") return `Merge ${images}`;
    return `Apply to ${images}`;
  });
</script>

<section class="section" aria-labelledby="tool-title">
  {#if !session.tool || !session.op}
    <h2 id="tool-title">Tools</h2>
    <ul>
      {#each OPS as op (op.id)}
        <li>
          <button type="button" onclick={() => session.openTool(op.id)}>
            <strong>{op.title}</strong>
            <span class="hint">{op.description}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    {@const op = session.op}
    <div class="section-head">
      <h2 id="tool-title">{op.title}</h2>
      <button
        type="button"
        disabled={session.running}
        onclick={() => session.closeTool()}>All tools</button
      >
    </div>
    <p class="hint">{op.description}</p>

    {#if op.id === "transform"}
      <CropEditor />
    {:else if op.id === "strip-metadata" && session.selected}
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
    <ParamForm
      schema={op.params}
      values={session.tool.params}
      idPrefix={op.id}
      onchange={(key, value) => session.setParam(key, value)}
    />

    {#if session.running}
      <div class="row">
        <progress
          value={session.progress.done}
          max={Math.max(1, session.progress.total)}
        ></progress>
        <span>{session.progress.done} of {session.progress.total} done</span>
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
      {#if count === 0}<p class="hint">Add images to start.</p>{/if}
    {/if}
  {/if}
</section>

<style>
  ul {
    display: grid;
    gap: 0.3rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  ul button {
    display: grid;
    text-align: left;
    width: 100%;
  }

  ul.bullets {
    display: block;
    list-style: disc;
    margin-top: 0.2rem;
    padding-left: 1.1rem;
  }

  .primary {
    padding: 0.5rem;
  }

  progress {
    flex: 1;
  }
</style>
