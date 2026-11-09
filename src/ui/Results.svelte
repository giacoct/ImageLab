<!--
  What the tool made: the result images, to download one by one or all
  together, or to use as the images for another tool; or, for Extract text
  and Convert to SVG, the text (in full, to read and copy) and the SVGs.
-->
<script lang="ts">
  import { downloadBlob, downloadZip } from "../app/download";
  import { session } from "../app/session.svelte";
  import { formatBytes } from "../core/files";
  import type { Output } from "../engine/pipeline";
  import BlobImage from "./BlobImage.svelte";

  const FORMAT_NAMES: Record<string, string> = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/avif": "AVIF",
  };

  const count = $derived(session.results.length + session.outputs.length);
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

  function downloadAll(): void {
    if (session.results.length) void session.download(session.results);
    else
      void downloadZip(
        session.outputs.map(({ output }) => output),
        "imagelab.zip",
      );
  }
</script>

{#if count || session.running}
  <section class="section" aria-label="Results">
    <div class="section-head">
      <h2>
        {#if session.running}
          Working… {session.progress.done} of {session.progress.total}
        {:else}
          {count === 1 ? "1 result" : `${count} results`}
        {/if}
      </h2>
      {#if count > 1 && !session.running}
        <button type="button" disabled={session.saving} onclick={downloadAll}>
          Download all (ZIP)
        </button>
      {/if}
      {#if session.results.length && !session.running}
        <button
          type="button"
          title="Use the results as the images for another tool"
          onclick={() => session.useResults()}
        >
          Use as input
        </button>
      {/if}
    </div>

    {#if session.stale && !session.running}
      <p class="notice warning">
        The settings or images changed since these results were made. Apply
        again to update them.
      </p>
    {/if}

    {#if session.results.length}
      <ul class="grid">
        {#each session.results as item (item.id)}
          {@const { version } = item}
          <li>
            <div class="thumb checker">
              <BlobImage blob={version.thumbnail} alt={version.name} />
            </div>
            <span class="hint">
              {version.width} × {version.height} ·
              {FORMAT_NAMES[version.encoding.format]}
              {#if version.file?.blob.type === version.encoding.format}
                · {formatBytes(version.file.blob.size)}
              {/if}
            </span>
            <button
              type="button"
              disabled={session.saving}
              onclick={() => session.download([item])}
            >
              Download
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#each session.outputs as { id, output } (id)}
      <article>
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
      </article>
    {/each}
  </section>
{/if}

<style>
  .grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .grid li,
  article {
    display: grid;
    gap: 0.4rem;
  }

  .thumb {
    align-items: center;
    aspect-ratio: 4 / 3;
    display: flex;
    justify-content: center;
    overflow: hidden;
  }

  .thumb :global(img) {
    max-height: 100%;
    object-fit: contain;
  }

  article .thumb {
    aspect-ratio: auto;
    max-height: 20rem;
  }

  article .thumb :global(img) {
    max-height: 20rem;
  }

  .name {
    overflow-wrap: anywhere;
  }

  textarea {
    min-height: 10rem;
    resize: vertical;
    width: 100%;
  }
</style>
