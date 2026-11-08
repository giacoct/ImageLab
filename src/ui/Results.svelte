<!--
  The results of the last run: one entry per output (rename, download), a ZIP
  of everything, failures, and handing the images on to another tool.
-->
<script lang="ts">
  import { downloadBlob, downloadZip } from '../app/download';
  import { router } from '../app/router.svelte';
  import { session } from '../app/session.svelte';
  import { formatBytes } from '../core/files';
  import BlobImage from './BlobImage.svelte';
  import OcrText from './OcrText.svelte';

  const images = $derived(session.results.filter((result) => !result.output.ocr));
  const texts = $derived(session.results.filter((result) => result.output.ocr));
  const totalOut = $derived(
    session.results.reduce((sum, result) => sum + result.output.blob.size, 0),
  );

  /** Size change against the input, e.g. "−42%". */
  function change(result: (typeof session.results)[number]): string {
    if (result.output.ocr || result.inputSize === 0) return '';
    const ratio = result.output.blob.size / result.inputSize - 1;
    return `${ratio > 0 ? '+' : '−'}${Math.abs(Math.round(ratio * 100))}%`;
  }

  function useAsInput(): void {
    session.useResultsAsInput();
    router.go({ page: 'home' });
  }
</script>

<div class="results">
  <div class="row">
    <span class="summary">
      {#if session.running}
        Processing {session.progress.done} of {session.progress.total}…
      {:else if session.results.length}
        {session.results.length}
        {session.results.length === 1 ? 'result' : 'results'} · {formatBytes(totalOut)}
      {:else if !session.failures.length}
        <span class="muted">No results yet. Process the images to see them here.</span>
      {/if}
    </span>
    {#if session.results.length > 1}
      <button
        type="button"
        onclick={() =>
          downloadZip(
            session.results.map((r) => r.output),
            'imagelab.zip',
          )}
      >
        Download all (ZIP)
      </button>
    {/if}
    {#if session.chainable.length && !session.running}
      <button type="button" onclick={useAsInput}>Use in another tool</button>
    {/if}
  </div>

  {#if session.stale && !session.running}
    <p class="notice warning">
      The settings or images changed since these results were made. Process again to update them.
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
    <OcrText output={result.output} />
  {/each}

  {#if images.length}
    <ul class="grid">
      {#each images as result (result.id)}
        <li>
          <div class="thumb checker">
            <BlobImage blob={result.output.thumbnail} alt={result.output.name} />
          </div>
          <input
            aria-label="File name"
            value={result.output.name}
            onchange={(event) => session.renameResult(result.id, event.currentTarget.value)}
          />
          <span class="hint">
            {result.output.width} × {result.output.height} · {formatBytes(result.output.blob.size)}
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

  input {
    min-width: 0;
    width: 100%;
  }
</style>
