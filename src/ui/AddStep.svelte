<!-- "Add a step": a drop-down of every tool that can be chained next. -->
<script lang="ts">
  import { session } from '../app/session.svelte';
</script>

<select
  aria-label="Add a step"
  value=""
  onchange={(event) => {
    const opId = event.currentTarget.value;
    event.currentTarget.value = '';
    if (opId) session.addStep(opId);
  }}
>
  <option value="" disabled>+ Add a step…</option>
  {#each session.availableOps() as op (op.id)}
    <option value={op.id} title={op.description}>{op.title}</option>
  {/each}
</select>
