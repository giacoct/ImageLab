<!--
  An OCR result: the image with an invisible but selectable text layer over
  each recognized word, plus the full text to copy or download.
-->
<script lang="ts">
  import { downloadBlob } from '../app/download';
  import type { Output } from '../engine/pipeline';
  import BlobImage from './BlobImage.svelte';
  import Icon from './Icon.svelte';

  let { output }: { output: Output } = $props();

  let copied = $state(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(output.ocr?.text ?? '');
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard unavailable (e.g. permissions): the text box is still selectable.
    }
  }
</script>

<article class="panel ocr">
  <h3>{output.name}</h3>
  <div class="layout">
    {#if output.display}
      <div class="image">
        <BlobImage blob={output.display} alt="Source of the recognized text" />
        <div class="words" aria-hidden="true">
          {#each output.ocr?.words ?? [] as word, index (index)}
            <span
              style:left="{word.left * 100}%"
              style:top="{word.top * 100}%"
              style:width="{word.width * 100}%"
              style:height="{word.height * 100}%"
              style:font-size="{word.height * 100}cqh"
              >{word.text}
            </span>
          {/each}
        </div>
      </div>
    {/if}
    <div class="text">
      {#if output.ocr?.text}
        <textarea readonly aria-label="Recognized text">{output.ocr.text}</textarea>
      {:else}
        <p class="muted">No text was found.</p>
      {/if}
      <div class="actions">
        <button class="button small" type="button" onclick={copy} disabled={!output.ocr?.text}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy'}
        </button>
        <button
          class="button small"
          type="button"
          onclick={() => downloadBlob(output.blob, output.name)}
        >
          <Icon name="download" size={16} />.txt
        </button>
      </div>
    </div>
  </div>
</article>

<style>
  .ocr {
    display: grid;
    gap: 0.75rem;
  }

  h3 {
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .layout {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }

  .image {
    align-self: start;
    position: relative;
  }

  .image :global(img) {
    border-radius: 0.4rem;
    width: 100%;
  }

  .words {
    container-type: size;
    inset: 0;
    position: absolute;
  }

  .words span {
    color: transparent;
    line-height: 1;
    position: absolute;
    white-space: pre;
  }

  .words span::selection {
    background: color-mix(in srgb, var(--accent) 35%, transparent);
  }

  .text {
    display: grid;
    gap: 0.5rem;
    grid-template-rows: 1fr auto;
  }

  textarea {
    background: var(--panel-subtle);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    min-height: 10rem;
    padding: 0.6rem;
    resize: vertical;
    width: 100%;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
