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

  /** Size change against the input, e.g. "−42%"; `smaller` colors it. */
  function change(result: (typeof session.results)[number]): { text: string; smaller: boolean } {
    if (result.output.ocr || result.inputSize === 0) return { text: '', smaller: false };
    const ratio = result.output.blob.size / result.inputSize - 1;
    const sign = ratio > 0 ? '+' : '−';
    return { text: `${sign}${Math.abs(Math.round(ratio * 100))}%`, smaller: ratio < 0 };
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
        <span class="spinner"></span>
        Processing {session.progress.done} of {session.progress.total}…
      {:else if session.results.length}
        <span class="done" class:stale={session.stale}><Icon name="check" size={14} /></span>
        <strong>{session.results.length}</strong>
        {session.results.length === 1 ? 'result,' : 'results,'}
        {formatBytes(totalOut)} in all
      {/if}
    </p>
    <div class="actions">
      {#if session.results.length > 1}
        <button
          class="button small primary"
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
      {#if session.chainable.length && !session.running}
        <button class="button small" type="button" onclick={useAsInput}>
          <Icon name="next" size={16} />Use in another tool
        </button>
      {/if}
    </div>
  </div>

  {#if !session.running && !session.results.length && !session.failures.length}
    <div class="empty">
      <span class="frame crop-marks" aria-hidden="true"><Icon name="download" size={24} /></span>
      <strong>No results yet</strong>
      <span class="muted">Process the images, and the files to download appear here.</span>
    </div>
  {/if}

  {#if session.stale && !session.running}
    <p class="notice warning">
      <Icon name="alert" size={16} />
      The settings or images changed since these results were made. Process again to update them.
    </p>
  {/if}

  {#if session.failures.length}
    <div class="notice error" role="alert">
      <Icon name="alert" size={16} />
      <div>
        <strong>{session.failures.length} failed:</strong>
        <ul>
          {#each session.failures as failure, index (index)}
            <li>{failure.name}: {failure.message}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  {#each texts as result (result.id)}
    <OcrText output={result.output} />
  {/each}

  {#if images.length}
    <ul class="grid">
      {#each images as result, index (result.id)}
        {@const delta = change(result)}
        <li class="panel card" style:--i={Math.min(index, 12)}>
          <div class="thumb">
            <BlobImage blob={result.output.thumbnail} alt={result.output.name} />
          </div>
          <input
            class="input name"
            aria-label="File name"
            value={result.output.name}
            onchange={(event) => session.renameResult(result.id, event.currentTarget.value)}
          />
          <p class="hint">
            <span class="facts">
              <span>{result.output.width} × {result.output.height}</span>
              <span>{formatBytes(result.output.blob.size)}</span>
            </span>
            {#if delta.text}
              <span class="change" class:smaller={delta.smaller}>{delta.text}</span>
            {/if}
          </p>
          <button
            class="button small"
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
    gap: 0.9rem;
  }

  .summary {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: space-between;
    min-height: 2rem;
  }

  .summary p {
    align-items: center;
    display: flex;
    font-variant-numeric: tabular-nums;
    gap: 0.4rem;
  }

  .done {
    align-items: center;
    animation: pop 500ms var(--spring);
    background: var(--success);
    border-radius: 50%;
    color: var(--panel);
    display: inline-flex;
    height: 1.4rem;
    justify-content: center;
    width: 1.4rem;
  }

  .done.stale {
    background: var(--soft);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .empty {
    align-content: center;
    background: var(--stage);
    border-radius: var(--radius);
    display: grid;
    gap: 0.35rem;
    justify-items: center;
    min-height: 22rem;
    padding: 1.5rem;
    text-align: center;
  }

  .frame {
    --mark-size: 14px;
    align-items: center;
    color: var(--soft);
    display: flex;
    height: 5rem;
    justify-content: center;
    margin-bottom: 0.75rem;
    width: 6.5rem;
  }

  .empty strong {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-stretch: 112%;
    font-weight: 650;
  }

  .notice ul {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
  }

  .grid {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .card {
    animation: deal 420ms var(--ease) both;
    animation-delay: calc(var(--i) * 45ms);
    display: grid;
    gap: 0.55rem;
    padding: 0.55rem 0.55rem 0.7rem;
  }

  @keyframes deal {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  /* Each result is a print on the grey mat; transparency shows only on the image. */
  .thumb {
    align-items: center;
    aspect-ratio: 4 / 3;
    background: var(--stage);
    border-radius: 8px;
    display: flex;
    justify-content: center;
    overflow: hidden;
    padding: 0.7rem;
  }

  .thumb :global(img) {
    background-color: var(--checker-base);
    background-image:
      linear-gradient(45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(-45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--checker) 75%),
      linear-gradient(-45deg, transparent 75%, var(--checker) 75%);
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
    background-size: 12px 12px;
    box-shadow: 0 8px 18px -8px rgb(0 0 0 / 0.45);
    max-height: 100%;
    object-fit: contain;
    transition: transform 400ms var(--ease);
  }

  .card:hover .thumb :global(img) {
    transform: scale(1.03);
  }

  .name {
    font-size: 0.82rem;
    min-height: 2rem;
  }

  .hint {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
  }

  .change {
    background: var(--warning-soft);
    border-radius: 999px;
    color: var(--warning);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    padding: 0 0.4rem;
  }

  .change.smaller {
    background: var(--success-soft);
    color: var(--success);
  }
</style>
