<!--
  What couldn't be done: files that couldn't be opened, images a tool
  failed on, a download that failed. Dismissed by hand.
-->
<script lang="ts">
  import X from "@lucide/svelte/icons/x";

  import { session } from "../app/session.svelte";
</script>

{#if session.failures.length}
  <div class="notice error" role="alert">
    <ul>
      {#each session.failures as failure, index (index)}
        <li><strong>{failure.name}</strong>: {failure.message}</li>
      {/each}
    </ul>
    <button
      class="icon quiet"
      type="button"
      aria-label="Dismiss"
      onclick={() => session.dismissFailures()}><X size={16} /></button
    >
  </div>
{/if}

<style>
  .notice {
    align-items: start;
    display: flex;
    gap: 0.5rem;
  }

  ul {
    display: grid;
    flex: 1;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0.45rem 0 0;
  }

  button {
    color: inherit;
  }
</style>
