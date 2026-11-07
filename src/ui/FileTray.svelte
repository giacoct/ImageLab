<!--
  The imported files: drop zone (click, drag & drop, or paste), and the list
  with thumbnails, sizes, problems, drag-to-reorder (the order carries into
  merges and outputs) and selection for the preview.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { formatBytes } from '../core/files';
  import BlobImage from './BlobImage.svelte';
  import Icon from './Icon.svelte';

  let input: HTMLInputElement;
  let dragging = $state(false);
  let dragFrom = $state<number | null>(null);

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging = false;
    if (dragFrom === null && event.dataTransfer?.files.length)
      session.addFiles(event.dataTransfer.files);
  }

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

<section class="panel tray" aria-labelledby="files-title">
  <div class="head">
    <h2 class="panel-title" id="files-title">
      <Icon name="image" />Images
      {#if session.items.length}<span class="count">{session.items.length}</span>{/if}
    </h2>
    {#if session.items.length}
      <button class="button small" type="button" onclick={() => session.clearFiles()}>Clear</button>
    {/if}
  </div>

  <button
    type="button"
    class="drop"
    class:dragging
    class:compact={session.items.length > 0}
    onclick={() => input.click()}
    ondragover={(event) => {
      event.preventDefault();
      if (dragFrom === null) dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <Icon name="upload" size={session.items.length ? 18 : 28} />
    <span>
      <strong>Choose images</strong> or drop them here
      <span class="hint">— or paste from the clipboard. JPEG, PNG, WebP, AVIF, GIF, HEIC.</span>
    </span>
  </button>
  <input
    bind:this={input}
    class="visually-hidden"
    type="file"
    accept="image/*,.heic,.heif"
    multiple
    tabindex="-1"
    onchange={(event) => {
      session.addFiles(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
    }}
  />

  {#if session.items.length}
    <ul class="list">
      {#each session.items as item, index (item.id)}
        {@const warnings = session.warnings(item)}
        <li
          class:selected={index === session.selected}
          class:over={dragFrom !== null && dragFrom !== index}
          draggable="true"
          ondragstart={(event) => {
            dragFrom = index;
            event.dataTransfer?.setData('text/plain', item.id);
          }}
          ondragend={() => (dragFrom = null)}
          ondragover={(event) => event.preventDefault()}
          ondrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (dragFrom !== null) session.moveItem(dragFrom, index);
            dragFrom = null;
          }}
        >
          <button class="select" type="button" onclick={() => (session.selected = index)}>
            <span class="thumb checker">
              {#if item.info}
                <BlobImage blob={item.info.thumbnail} alt="" />
              {/if}
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
              {#each warnings as warning (warning)}
                <span class="warning-text"><Icon name="alert" size={13} />{warning}</span>
              {/each}
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
              class="icon-button"
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
  .tray {
    display: grid;
    gap: 0.75rem;
  }

  .head {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .count {
    background: var(--accent-soft);
    border-radius: 999px;
    color: var(--accent-strong);
    font-size: 0.75rem;
    padding: 0.05rem 0.5rem;
  }

  .drop {
    align-items: center;
    background: var(--panel-subtle);
    border: 1.5px dashed var(--border-strong);
    border-radius: 0.65rem;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.6rem 1rem;
    text-align: center;
    transition:
      border-color 140ms var(--ease),
      background 140ms var(--ease);
  }

  .drop.compact {
    flex-direction: row;
    padding: 0.6rem 0.8rem;
    text-align: left;
  }

  .drop.compact .hint {
    display: none;
  }

  .drop:hover,
  .drop.dragging {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-strong);
  }

  .drop strong {
    color: var(--ink);
  }

  .list {
    display: grid;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    max-height: 22rem;
    overflow-y: auto;
    padding: 0;
  }

  li {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 0.55rem;
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
  }

  li.selected {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  }

  li.over:hover {
    border-color: var(--accent);
    border-style: dashed;
  }

  .select {
    align-items: center;
    background: none;
    border: 0;
    display: flex;
    flex: 1;
    gap: 0.65rem;
    min-width: 0;
    padding: 0;
    text-align: left;
  }

  .thumb {
    align-items: center;
    border-radius: 0.4rem;
    display: flex;
    flex: none;
    height: 2.75rem;
    justify-content: center;
    overflow: hidden;
    width: 2.75rem;
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
