<!--
  The imported files (the first section of the process sheet): a button to choose more
  (dropping anywhere on the page and pasting also work, see DropOverlay), and
  the list with thumbnails, sizes, problems, drag-to-reorder (the order
  carries into merges and outputs) and selection for the preview.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';

  import { session } from '../app/session.svelte';
  import { formatBytes } from '../core/files';
  import BlobImage from './BlobImage.svelte';
  import CardHead from './CardHead.svelte';
  import FilePicker from './FilePicker.svelte';
  import Icon from './Icon.svelte';
  import { ms } from './motion';
  import { NEUTRAL } from './patches';

  let picker: FilePicker;
  let dragFrom = $state<number | null>(null);

  function onPaste(event: ClipboardEvent): void {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    session.addFiles(files);
  }

  function label(type: string): string {
    return type.replace('image/', '').toUpperCase();
  }
</script>

<svelte:window onpaste={onPaste} />

<section class="section tray" aria-labelledby="files-title">
  <CardHead icon="image" patch={NEUTRAL.input} title="Images" id="files-title">
    {#if session.items.length}
      <span class="badge">{session.items.length}</span>
      <button class="button small ghost" type="button" onclick={() => session.clearFiles()}>
        Clear
      </button>
    {/if}
  </CardHead>

  <button
    type="button"
    class="drop"
    class:compact={session.items.length > 0}
    onclick={() => picker.open()}
  >
    <span class="drop-icon"><Icon name={session.items.length ? 'plus' : 'upload'} size={20} /></span
    >
    <span class="drop-text">
      <strong>{session.items.length ? 'Add more images' : 'Choose images'}</strong>
      <span class="hint">
        {session.items.length
          ? 'or drop them anywhere'
          : 'Or drop them anywhere, or paste them. JPEG, PNG, WebP, AVIF, GIF, HEIC.'}
      </span>
    </span>
  </button>
  <FilePicker bind:this={picker} />

  {#if session.items.length}
    <ul class="list">
      {#each session.items as item, index (item.id)}
        {@const warning = session.warning(item)}
        <li
          class:selected={index === session.selected}
          class:dragged={dragFrom === index}
          class:over={dragFrom !== null && dragFrom !== index}
          draggable="true"
          animate:flip={{ duration: ms(260) }}
          in:fly={{ x: -10, duration: ms(260) }}
          out:fade={{ duration: ms(120) }}
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
          <button class="select" type="button" onclick={() => (session.selected = index)}>
            <span class="thumb checker">
              {#if item.info}
                <BlobImage blob={item.info.thumbnail} alt="" />
              {:else if !item.error}
                <span class="spinner"></span>
              {/if}
            </span>
            <span class="meta">
              <span class="name">{item.file.name}</span>
              <span class="hint">
                {#if item.error}
                  <span class="error-text">{item.error}</span>
                {:else if item.info}
                  <span class="facts">
                    <span>{item.info.width} × {item.info.height}</span>
                    <span>{formatBytes(item.file.size)}</span>
                    <span>{label(item.info.type)}</span>
                  </span>
                {:else}
                  Reading…
                {/if}
              </span>
              {#if warning}
                <span class="warning-text"><Icon name="alert" size={13} />{warning}</span>
              {/if}
            </span>
          </button>
          <span class="actions">
            <button
              class="icon-button"
              type="button"
              aria-label="Move {item.file.name} up"
              disabled={index === 0}
              onclick={() => session.moveItem(index, index - 1)}
              ><Icon name="up" size={16} /></button
            >
            <button
              class="icon-button"
              type="button"
              aria-label="Move {item.file.name} down"
              disabled={index === session.items.length - 1}
              onclick={() => session.moveItem(index, index + 1)}
              ><Icon name="down" size={16} /></button
            >
            <button
              class="icon-button danger"
              type="button"
              aria-label="Remove {item.file.name}"
              onclick={() => session.removeItem(item.id)}><Icon name="close" size={16} /></button
            >
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .drop {
    align-items: center;
    background: var(--panel-subtle);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-sm);
    color: var(--muted);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.6rem 1rem;
    text-align: center;
    transition:
      background 180ms var(--ease),
      color 180ms var(--ease);
  }

  .drop.compact {
    flex-direction: row;
    gap: 0.7rem;
    padding: 0.5rem 0.7rem;
    text-align: left;
  }

  .drop:hover {
    background-color: var(--hover);
    color: var(--ink);
  }

  .drop:hover {
    border-color: var(--ink);
  }

  .drop-icon {
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--ink);
    display: flex;
    flex: none;
    height: 2.6rem;
    justify-content: center;
    transition: transform 400ms var(--spring);
    width: 2.6rem;
  }

  .compact .drop-icon {
    height: 1.9rem;
    width: 1.9rem;
  }

  .drop:hover .drop-icon {
    transform: translateY(-3px);
  }

  .compact:hover .drop-icon {
    transform: rotate(90deg);
  }

  .drop-text {
    display: grid;
    gap: 0.1rem;
  }

  .drop strong {
    color: var(--ink);
  }

  .list {
    display: grid;
    gap: 0.2rem;
    list-style: none;
    margin: 0 -0.35rem;
    max-height: 22rem;
    overflow-y: auto;
    padding: 0;
  }

  li {
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    display: flex;
    gap: 0.25rem;
    padding: 0.3rem;
    transition:
      background 160ms var(--ease),
      border-color 160ms var(--ease);
  }

  li:hover {
    background: var(--panel-subtle);
  }

  li.selected {
    background: var(--accent-soft);
    border-color: var(--border-strong);
  }

  li.dragged {
    opacity: 0.5;
  }

  li.over:hover {
    border-color: var(--ink);
    border-style: dashed;
  }

  .select {
    align-items: center;
    background: none;
    border: 0;
    display: flex;
    flex: 1;
    gap: 0.7rem;
    min-width: 0;
    padding: 0;
    text-align: left;
  }

  /* Thumbnails are little prints: a white border, and the selected one is raised. */
  .thumb {
    align-items: center;
    border: 2px solid var(--panel);
    box-shadow: 0 0 0 1px var(--border-strong);
    color: var(--muted);
    display: flex;
    flex: none;
    height: 2.75rem;
    justify-content: center;
    overflow: hidden;
    transition:
      transform 300ms var(--spring),
      box-shadow 300ms var(--ease);
    width: 2.75rem;
  }

  .selected .thumb {
    box-shadow:
      0 0 0 1px var(--ink),
      var(--shadow);
    transform: translateY(-1px) scale(1.04);
  }

  .thumb :global(img) {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .meta {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  .name {
    font-size: 0.88rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-text {
    color: var(--danger);
  }

  .warning-text {
    align-items: center;
    color: var(--warning);
    display: flex;
    font-size: 0.78rem;
    gap: 0.3rem;
  }

  .actions {
    display: flex;
    flex: none;
  }
</style>
