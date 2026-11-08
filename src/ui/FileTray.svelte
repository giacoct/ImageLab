<!--
  The images to process: a button to choose more (dropping and pasting
  anywhere also work, see DropOverlay), and the list with thumbnails, sizes
  and problems. Clicking an image shows it in the preview.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { formatBytes } from '../core/files';
  import BlobImage from './BlobImage.svelte';

  let picker: HTMLInputElement;
</script>

<section class="section" aria-labelledby="files-title">
  <div class="section-head">
    <h2 id="files-title">
      Images{session.items.length ? ` (${session.items.length})` : ''}
    </h2>
    <button type="button" onclick={() => picker.click()}>
      {session.items.length ? 'Add' : 'Choose images'}
    </button>
    {#if session.items.length}
      <button type="button" onclick={() => session.clearFiles()}>Clear</button>
    {/if}
  </div>
  <input
    bind:this={picker}
    hidden
    type="file"
    accept="image/*,.heic,.heif"
    multiple
    onchange={(event) => {
      session.addFiles(event.currentTarget.files ?? []);
      event.currentTarget.value = ''; // so choosing the same file again still counts
    }}
  />

  {#if session.items.length === 0}
    <p class="hint">Or drop or paste them anywhere. JPEG, PNG, WebP, AVIF, GIF, HEIC.</p>
  {:else}
    <ul>
      {#each session.items as item (item.id)}
        <li class:selected={item.id === session.selected?.id}>
          <button
            class="select"
            type="button"
            title="Show in the preview"
            onclick={() => (session.selectedId = item.id)}
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
                  {item.info.width} × {item.info.height} · {formatBytes(item.file.size)} ·
                  {item.info.type.replace('image/', '').toUpperCase()}
                {:else}
                  Reading…
                {/if}
              </span>
            </span>
          </button>
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
