<!-- "Add a step": a drop-down of every tool. Any tool can follow any other, any number of times. -->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { OPS } from '../ops';
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
  {#each OPS as op (op.id)}
    <option value={op.id}>{op.title}</option>
  {/each}
</select>
