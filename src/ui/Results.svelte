<!--
  The results of the last run: one card per output (rename, download), a ZIP
  of everything, failures, and handing the images on to another tool.
-->
<script lang="ts">
  import { downloadBlob, downloadZip } from '../app/download';
  import { router } from '../app/router.svelte';
  import { session } from '../app/session.svelte';
  import { formatBytes } from '../core/files';
  import BlobImage from './BlobImage.svelte';
  import Icon from './Icon.svelte';
  import OcrText from './OcrText.svelte';

  const images = $derived(session.results.filter((result) => !result.output.ocr));
  const texts = $derived(session.results.filter((result) => result.output.ocr));
  const totalOut = $derived(
    session.results.reduce((sum, result) => sum + result.output.blob.size, 0),
  );
  const chainable = $derived(
    images.some((result) => /^image\/(jpeg|png|webp|avif)$/.test(result.output.blob.type)),
  );

  function change(result: (typeof session.results)[number]): string {
    if (result.output.ocr || result.inputSize === 0) return '';
    const ratio = result.output.blob.size / result.inputSize - 1;
    const sign = ratio > 0 ? '+' : '−';
    return `${sign}${Math.abs(Math.round(ratio * 100))}%`;
  }

  function useAsInput(): void {
    session.useResultsAsInput();
    router.go({ page: 'home' });
  }
</script>

<div class="results">
  <div class="summary">
    <p>
      {#if session.running}
        Processing {session.progress.done} of {session.progress.total}…
      {:else if session.results.length}
        <strong>{session.results.length}</strong>
        {session.results.length === 1 ? 'result' : 'results'} · {formatBytes(totalOut)}
      {:else if !session.failures.length}
        <span class="muted">Results appear here after you process the images.</span>
      {/if}
    </p>
    <div class="actions">
      {#if session.results.length > 1}
        <button
          class="button small"
          type="button"
          onclick={() =>
            downloadZip(
              session.results.map((r) => r.output),
              'imagelab.zip',
            )}
        >
          <Icon name="download" size={16} />Download all (ZIP)
        </button>
      {/if}
      {#if chainable && !session.running}
        <button class="button small" type="button" onclick={useAsInput}>
          <Icon name="next" size={16} />Use in another tool
        </button>
      {/if}
    </div>
  </div>

  {#if session.running}
    <progress max={session.progress.total} value={session.progress.done}></progress>
  {/if}

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
        <li class="panel card">
          <div class="thumb checker">
            <BlobImage blob={result.output.blob} alt={result.output.name} />
          </div>
          <input
            class="input name"
            aria-label="File name"
            value={result.output.name}
            onchange={(event) => session.renameResult(result.id, event.currentTarget.value)}
          />
          <p class="hint">
            {result.output.width} × {result.output.height} · {formatBytes(result.output.blob.size)}
            {#if change(result)}<span class="change">{change(result)}</span>{/if}
          </p>
          <button
            class="button small primary"
            type="button"
            onclick={() => downloadBlob(result.output.blob, result.output.name)}
          >
            <Icon name="download" size={16} />Download
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .results {
    display: grid;
    gap: 0.85rem;
  }

  .summary {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: space-between;
    min-height: 2rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  progress {
    accent-color: var(--accent);
    width: 100%;
  }

  .notice ul {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
  }

  .grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .card {
    display: grid;
    gap: 0.5rem;
    padding: 0.6rem;
  }

  .thumb {
    align-items: center;
    aspect-ratio: 4 / 3;
    border-radius: 0.45rem;
    display: flex;
    justify-content: center;
    overflow: hidden;
  }

  .thumb :global(img) {
    max-height: 100%;
    object-fit: contain;
  }

  .name {
    font-size: 0.82rem;
    min-height: 2rem;
  }

  .change {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    margin-left: 0.25rem;
  }
</style>
