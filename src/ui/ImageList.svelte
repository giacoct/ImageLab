<!--
  The current images: a button to choose more (dropping and pasting anywhere
  also work, see DropOverlay), and the list with thumbnails, sizes and a
  download each. After a tool, these are its results. Clicking an image shows
  it in the preview.
-->
<script lang="ts">
  import { session } from "../app/session.svelte";
  import { formatBytes } from "../core/files";
  import BlobImage from "./BlobImage.svelte";

  let picker: HTMLInputElement;

  const FORMAT_NAMES: Record<string, string> = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/avif": "AVIF",
  };
</script>

<section class="section" aria-labelledby="images-title">
  <div class="section-head">
    <h2 id="images-title">
      Images{session.items.length ? ` (${session.items.length})` : ""}
    </h2>
    <button type="button" onclick={() => picker.click()}>
      {session.items.length ? "Add" : "Choose images"}
    </button>
    {#if session.items.length}
      <button
        type="button"
        disabled={session.saving}
        onclick={() => session.download()}
      >
        {session.items.length > 1 ? "Download all (ZIP)" : "Download"}
      </button>
      <button type="button" onclick={() => session.clear()}>Start over</button>
    {/if}
  </div>
  <input
    bind:this={picker}
    hidden
    type="file"
    accept="image/*,.heic,.heif"
    multiple
    onchange={(event) => {
      void session.addFiles(event.currentTarget.files ?? []);
      event.currentTarget.value = ""; // so choosing the same file again still counts
    }}
  />

  {#if session.items.length === 0 && !session.reading}
    <p class="hint">
      Or drop or paste them anywhere. JPEG, PNG, WebP, AVIF, GIF, HEIC.
    </p>
  {/if}
  {#if session.reading}
    <p class="hint">
      Reading {session.reading}
      {session.reading === 1 ? "image" : "images"}…
    </p>
  {/if}

  {#if session.items.length}
    <ul>
      {#each session.items as item, index (item.id)}
        {@const { version } = item}
        <li class:selected={item === session.selected}>
          <button
            class="select"
            type="button"
            title="Show in the preview"
            onclick={() => (session.selectedIndex = index)}
          >
            <span class="thumb checker">
              <BlobImage blob={version.thumbnail} alt="" />
            </span>
            <span class="meta">
              <span class="name">{version.name}</span>
              <span class="hint">
                {version.width} × {version.height} ·
                {FORMAT_NAMES[version.encoding.format]}
                <!-- The size once known: the file is written (or is the input, in that format). -->
                {#if version.file?.blob.type === version.encoding.format}
                  · {formatBytes(version.file.blob.size)}
                {/if}
              </span>
            </span>
          </button>
          <button
            class="icon"
            type="button"
            aria-label="Download {version.name}"
            title="Download"
            disabled={session.saving}
            onclick={() => session.download([item])}>↓</button
          >
          <button
            class="icon"
            type="button"
            aria-label="Remove {version.name}"
            title="Remove"
            onclick={() => session.remove(item.id)}>×</button
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
