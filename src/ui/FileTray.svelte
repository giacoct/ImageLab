<!--
  The images to process: a button to choose more (dropping and pasting
  anywhere also work, see DropOverlay), and the list with thumbnails, sizes,
  problems, reordering (the order carries into merges and outputs) and
  selection for the preview.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { formatBytes } from '../core/files';
  import BlobImage from './BlobImage.svelte';
  import FilePicker from './FilePicker.svelte';

  let picker: FilePicker;
  let dragFrom = $state<number | null>(null);

  function label(type: string): string {
    return type.replace('image/', '').toUpperCase();
  }
</script>

<section class="section" aria-labelledby="files-title">
  <div class="section-head">
    <h2 id="files-title">
      Images{session.items.length ? ` (${session.items.length})` : ''}
    </h2>
    <button type="button" onclick={() => picker.open()}>
      {session.items.length ? 'Add' : 'Choose images'}
    </button>
    {#if session.items.length}
      <button type="button" onclick={() => session.clearFiles()}>Clear</button>
    {/if}
  </div>
  <FilePicker bind:this={picker} />

  {#if session.items.length === 0}
    <p class="hint">Or drop or paste them anywhere. JPEG, PNG, WebP, AVIF, GIF, HEIC.</p>
  {:else}
    <ul>
      {#each session.items as item, index (item.id)}
        {@const warning = session.warning(item)}
        <li
          class:selected={index === session.selected}
          class:dragged={dragFrom === index}
          draggable="true"
          ondragstart={(event) => {
            dragFrom = index;
            event.dataTransfer?.setData('text/plain', item.id);
          }}
          ondragend={() => (dragFrom = null)}
          ondragover={(event) => {
            if (dragFrom !== null) event.preventDefault();
          }}
          ondrop={(event) => {
            // Files dropped here bubble up to the page-wide drop handler.
            if (dragFrom === null) return;
            event.preventDefault();
            session.moveItem(dragFrom, index);
            dragFrom = null;
          }}
        >
          <button
            class="select"
            type="button"
            title="Show in the preview"
            onclick={() => (session.selected = index)}
          >
            <span class="thumb checker">
              {#if item.info}<BlobImage blob={item.info.thumbnail} alt="" />{/if}
            </span>
            <span class="meta">
              <span class="name">{item.file.name}</span>
              <span class="hint">
                {#if item.error}
                  <span class="error-text">{item.error}</span>
                {:else if item.info}
                  {item.info.width} × {item.info.height} · {formatBytes(item.file.size)} · {label(
                    item.info.type,
                  )}
                {:else}
                  Reading…
                {/if}
              </span>
              {#if warning}<span class="hint warning-text">{warning}</span>{/if}
            </span>
          </button>
          <button
            class="icon"
            type="button"
            aria-label="Move {item.file.name} up"
            disabled={index === 0}
            onclick={() => session.moveItem(index, index - 1)}>↑</button
          >
          <button
            class="icon"
            type="button"
            aria-label="Move {item.file.name} down"
            disabled={index === session.items.length - 1}
            onclick={() => session.moveItem(index, index + 1)}>↓</button
          >
          <button
            class="icon"
            type="button"
            aria-label="Remove {item.file.name}"
            onclick={() => session.removeItem(item.id)}>×</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  ul {
    display: grid;
    gap: 0.2rem;
    list-style: none;
    margin: 0;
    max-height: 22rem;
    overflow-y: auto;
    padding: 0;
  }

  li {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 4px;
    display: flex;
    gap: 0.25rem;
    padding: 0.2rem;
  }

  li.selected {
    background: var(--subtle);
    border-color: var(--border);
  }

  li.dragged {
    opacity: 0.5;
  }

  .select {
    align-items: center;
    background: none;
    border: 0;
    display: flex;
    flex: 1;
    gap: 0.6rem;
    min-width: 0;
    padding: 0;
    text-align: left;
  }

  .thumb {
    flex: none;
    height: 2.5rem;
    overflow: hidden;
    width: 2.5rem;
  }

  .thumb :global(img) {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .meta {
    display: grid;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
