<!--
  What the last final tool made: the text Extract text read (in full, to read
  and copy) or the SVGs Convert to SVG traced, each with its download, and a
  ZIP of everything.
-->
<script lang="ts">
  import { downloadBlob, downloadZip } from "../app/download";
  import { session } from "../app/session.svelte";
  import { formatBytes } from "../core/files";
  import type { Output } from "../engine/pipeline";
  import BlobImage from "./BlobImage.svelte";

  let copied = $state<string | null>(null);

  async function copy(id: string, output: Output): Promise<void> {
    try {
      await navigator.clipboard.writeText(output.text ?? "");
      copied = id;
      setTimeout(() => (copied = null), 1500);
    } catch {
      // No clipboard access: the text box can still be selected and copied.
    }
  }
</script>

{#if session.outputs.length}
  <section class="section" aria-label="Results">
    <div class="section-head">
      <h2>
        {session.outputs.length}
        {session.outputs.length === 1 ? "result" : "results"}
      </h2>
      {#if session.outputs.length > 1}
        <button
          type="button"
          onclick={() =>
            downloadZip(
              session.outputs.map(({ output }) => output),
              "imagelab.zip",
            )}
        >
          Download all (ZIP)
        </button>
      {/if}
      <button type="button" onclick={() => (session.outputs = [])}>Close</button
      >
    </div>

    <ul>
      {#each session.outputs as { id, output } (id)}
        <li>
          <span class="name">{output.name}</span>
          {#if output.text !== undefined}
            {#if output.text}
              <textarea readonly aria-label="Text from {output.name}"
                >{output.text}</textarea
              >
            {:else}
              <p class="muted">No text was found.</p>
            {/if}
          {:else}
            <div class="thumb checker">
              <BlobImage blob={output.thumbnail} alt={output.name} />
            </div>
          {/if}
          <div class="row">
            {#if output.text !== undefined}
              <button
                type="button"
                disabled={!output.text}
                onclick={() => copy(id, output)}
              >
                {copied === id ? "Copied" : "Copy text"}
              </button>
            {:else}
              <span class="hint">{formatBytes(output.blob.size)}</span>
            {/if}
            <button
              type="button"
              onclick={() => downloadBlob(output.blob, output.name)}
            >
              Download
            </button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  ul {
    display: grid;
    gap: 0.75rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: grid;
    gap: 0.4rem;
  }

  .name {
    overflow-wrap: anywhere;
  }

  .thumb {
    align-items: center;
    display: flex;
    justify-content: center;
    max-height: 20rem;
    overflow: hidden;
  }

  .thumb :global(img) {
    max-height: 20rem;
    object-fit: contain;
  }

  textarea {
    min-height: 10rem;
    resize: vertical;
    width: 100%;
  }
</style>
