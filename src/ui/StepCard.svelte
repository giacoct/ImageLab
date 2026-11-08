<!--
  One step of the recipe: its operation's generated settings form (plus the
  crop editor for "Rotate, flip & crop"), with controls to reorder or remove it.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { isTerminal } from '../ops/op';
  import CropEditor from './CropEditor.svelte';
  import ParamForm from './ParamForm.svelte';

  let { index }: { index: number } = $props();

  const step = $derived(session.steps[index]);
  const op = $derived(session.ops[index]);
  const hasSettings = $derived(Object.values(op.params).some((param) => param.kind !== 'custom'));
  const terminal = $derived(isTerminal(op));
</script>

<section class="section" aria-label="Step {index + 1}: {op.title}">
  <div class="section-head">
    <h2>{index + 1}. {op.title}</h2>
    <button
      class="icon"
      type="button"
      aria-label="Move {op.title} up"
      disabled={index === 0 || terminal}
      onclick={() => session.moveStep(index, -1)}>↑</button
    >
    <button
      class="icon"
      type="button"
      aria-label="Move {op.title} down"
      disabled={index === session.steps.length - 1 ||
        terminal ||
        isTerminal(session.ops[index + 1])}
      onclick={() => session.moveStep(index, 1)}>↓</button
    >
    <button
      class="icon"
      type="button"
      aria-label="Remove {op.title}"
      onclick={() => session.removeStep(index)}>×</button
    >
  </div>

  {#if op.id === 'transform'}
    <CropEditor {index} />
  {/if}
  {#if hasSettings}
    <ParamForm
      schema={op.params}
      values={step.params}
      idPrefix={step.id}
      onchange={(key, value) => session.setParam(index, key, value)}
    />
  {:else}
    <p class="hint">{op.description}</p>
  {/if}
</section>
