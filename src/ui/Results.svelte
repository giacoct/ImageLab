<!--
  The results of the last run: one entry per output with its download (OCR
  text shown in full, to read and copy), a ZIP of everything, and what failed.
-->
<script lang="ts">
  import { downloadBlob, downloadZip } from "../app/download";
  import { session, type Result } from "../app/session.svelte";
  import { formatBytes } from "../core/files";
  import BlobImage from "./BlobImage.svelte";

  const texts = $derived(
    session.results.filter((result) => result.output.text !== undefined),
  );
  const files = $derived(
    session.results.filter((result) => result.output.text === undefined),
  );
  const totalOut = $derived(
    session.results.reduce((sum, result) => sum + result.output.blob.size, 0),
  );

  let copied = $state<string | null>(null);

  async function copy(result: Result): Promise<void> {
    try {
      await navigator.clipboard.writeText(result.output.text ?? "");
      copied = result.id;
      setTimeout(() => (copied = null), 1500);
    } catch {
      // No clipboard access: the text box can still be selected and copied.
    }
  }

  /** Size change against the input, e.g. "−42%". */
  function change(result: Result): string {
    if (result.inputSize === 0 || !result.output.blob.type.startsWith("image/"))
      return "";
    const ratio = result.output.blob.size / result.inputSize - 1;
    return `${ratio > 0 ? "+" : "−"}${Math.abs(Math.round(ratio * 100))}%`;
  }
</script>

<div class="results">
  <div class="row">
    <span class="summary">
      {#if session.running}
        Processing {session.progress.done} of {session.progress.total}…
      {:else if session.results.length}
        {session.results.length}
        {session.results.length === 1 ? "result" : "results"} · {formatBytes(
          totalOut,
        )}
      {:else if !session.failures.length}
        <span class="muted"
          >No results yet. Process the images to see them here.</span
        >
      {/if}
    </span>
    {#if session.results.length > 1 && !session.running}
      <button
        type="button"
        onclick={() =>
          downloadZip(
            session.results.map((result) => result.output),
            "imagelab.zip",
          )}
      >
        Download all (ZIP)
      </button>
    {/if}
  </div>

  {#if session.stale && !session.running}
    <p class="notice warning">
      The settings or images changed since these results were made. Process
      again to update them.
    </p>
  {/if}

  {#if session.failures.length}
    <div class="notice error" role="alert">
      <strong>{session.failures.length} failed:</strong>
      <ul>
        {#each session.failures as failure, index (index)}
          <li>{failure.name}: {failure.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#each texts as result (result.id)}
    <article class="section">
      <span class="name">{result.output.name}</span>
      {#if result.output.text}
        <textarea readonly aria-label="Text from {result.output.name}"
          >{result.output.text}</textarea
        >
      {:else}
        <p class="muted">No text was found.</p>
      {/if}
      <div class="row">
        <button
          type="button"
          disabled={!result.output.text}
          onclick={() => copy(result)}
        >
          {copied === result.id ? "Copied" : "Copy text"}
        </button>
        <button
          type="button"
          onclick={() => downloadBlob(result.output.blob, result.output.name)}
        >
          Download .txt
        </button>
      </div>
    </article>
  {/each}

  {#if files.length}
    <ul class="grid">
      {#each files as result (result.id)}
        <li>
          <div class="thumb checker">
            <BlobImage
              blob={result.output.thumbnail}
              alt={result.output.name}
            />
          </div>
          <span class="name">{result.output.name}</span>
          <span class="hint">
            {result.output.width} × {result.output.height} · {formatBytes(
              result.output.blob.size,
            )}
            {change(result)}
          </span>
          <button
            type="button"
            onclick={() => downloadBlob(result.output.blob, result.output.name)}
          >
            Download
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .results {
    display: grid;
    gap: 0.75rem;
  }

  .summary {
    flex: 1;
  }

  .notice ul {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
  }

  .grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .grid li {
    border: 1px solid var(--border);
    border-radius: 6px;
    display: grid;
    gap: 0.4rem;
    padding: 0.4rem;
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

  .name {
    overflow-wrap: anywhere;
  }

  textarea {
    min-height: 10rem;
    resize: vertical;
    width: 100%;
  }
</style>
