<!--
  One step of the chain: its tool's generated settings form (plus the crop
  editor for "Rotate, flip & crop", and what "Strip metadata" will remove),
  with controls to reorder or remove it.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { getOp } from '../ops';
  import CropEditor from './CropEditor.svelte';
  import ParamForm from './ParamForm.svelte';

  let { index }: { index: number } = $props();

  const step = $derived(session.steps[index]);
  const op = $derived(getOp(step.op));
</script>

<section class="section" aria-label="Step {index + 1}: {op.title}">
  <div class="section-head">
    <h2>{index + 1}. {op.title}</h2>
    <button
      class="icon"
      type="button"
      aria-label="Move {op.title} up"
      disabled={!session.canMove(index, -1)}
      onclick={() => session.moveStep(index, -1)}>↑</button
    >
    <button
      class="icon"
      type="button"
      aria-label="Move {op.title} down"
      disabled={!session.canMove(index, 1)}
      onclick={() => session.moveStep(index, 1)}>↓</button
    >
    <button
      class="icon"
      type="button"
      aria-label="Remove {op.title}"
      onclick={() => session.removeStep(index)}>×</button
    >
  </div>
  <p class="hint">{op.description}</p>

  {#if op.id === 'transform'}
    <CropEditor {index} />
  {:else if op.id === 'strip-metadata' && session.selected?.info}
    {@const { file, info } = session.selected}
    {#if info.metadata.length}
      <div class="hint">
        In {file.name}:
        <ul>
          {#each info.metadata as entry (entry)}<li>{entry}</li>{/each}
        </ul>
      </div>
    {:else}
      <p class="hint">No metadata in {file.name}.</p>
    {/if}
  {/if}
  <ParamForm
    schema={op.params}
    values={step.params}
    idPrefix={step.id}
    onchange={(key, value) => session.setParam(index, key, value)}
  />
</section>

<style>
  ul {
    margin: 0.2rem 0 0;
    padding-left: 1.1rem;
  }
</style>
