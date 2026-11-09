<!--
  Undo and redo through what was done to the images (added, a tool applied,
  removed), and the whole history to jump back to any point.
-->
<script lang="ts">
  import { session } from "../app/session.svelte";
</script>

{#if session.entries.length > 1}
  <section class="section" aria-label="History">
    <div class="row">
      <button
        type="button"
        disabled={!session.canUndo}
        onclick={() => session.undo()}
      >
        ↶ Undo{session.canUndo ? ` ${session.entries[session.position]}` : ""}
      </button>
      <button
        type="button"
        disabled={!session.canRedo}
        onclick={() => session.redo()}
      >
        ↷ Redo{session.canRedo
          ? ` ${session.entries[session.position + 1]}`
          : ""}
      </button>
    </div>
    <details>
      <summary class="hint">History ({session.entries.length - 1})</summary>
      <ol>
        {#each session.entries as label, index (index)}
          <li>
            <button
              type="button"
              class="link"
              aria-current={index === session.position ? "step" : undefined}
              disabled={session.running}
              onclick={() => session.goTo(index)}
            >
              {label}
            </button>
          </li>
        {/each}
      </ol>
    </details>
  </section>
{/if}

<style>
  ol {
    margin: 0.3rem 0 0;
    padding-left: 1.4rem;
  }

  .link {
    background: none;
    border: 0;
    padding: 0.1rem 0;
    text-align: left;
  }

  [aria-current="step"] {
    font-weight: 600;
  }
</style>
