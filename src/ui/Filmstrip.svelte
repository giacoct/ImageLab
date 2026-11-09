<!--
  The images a tool works on, as a row of thumbnails: pick one to show it in
  the viewer, remove one, or add more. Under the row, the picked image's
  name and details.
-->
<script lang="ts">
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";

  import { chooseImages } from "../app/picker";
  import { session } from "../app/session.svelte";
  import { formatBytes } from "../core/files";
  import BlobImage from "./BlobImage.svelte";

  const FORMAT_NAMES: Record<string, string> = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/avif": "AVIF",
  };

  const version = $derived(session.selected?.version);
</script>

<div class="filmstrip">
  <ul aria-label="Images">
    {#each session.items as item, index (item.id)}
      <li>
        <button
          class="thumb checker"
          type="button"
          aria-label="Show {item.version.name}"
          aria-pressed={item === session.selected}
          onclick={() => (session.selectedIndex = index)}
        >
          <BlobImage blob={item.version.thumbnail} alt="" />
        </button>
        <button
          class="remove icon"
          type="button"
          aria-label="Remove {item.version.name}"
          title="Remove"
          onclick={() => session.remove(item.id)}><X size={14} /></button
        >
      </li>
    {/each}
    <li>
      <button
        class="add"
        type="button"
        aria-label="Add images"
        title="Add images"
        onclick={chooseImages}><Plus size={20} /></button
      >
    </li>
  </ul>

  <div class="caption">
    {#if version}
      <span class="name">{version.name}</span>
      <span class="hint numbers">{version.width} × {version.height}</span>
      <span class="hint">{FORMAT_NAMES[version.encoding.format]}</span>
      <!-- The size once known: the file is written, or is the input in that format. -->
      {#if version.file?.blob.type === version.encoding.format}
        <span class="hint numbers">{formatBytes(version.file.blob.size)}</span>
      {/if}
    {/if}
    {#if session.reading}
      <span class="hint">
        Reading {session.reading}
        {session.reading === 1 ? "image" : "images"}…
      </span>
    {/if}
    {#if session.items.length}
      <button class="quiet clear" type="button" onclick={() => session.clear()}>
        Remove all
      </button>
    {/if}
  </div>
</div>

<style>
  .filmstrip {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  ul {
    display: flex;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    overflow-x: auto;
    /* Room for the selection ring and the remove buttons. */
    padding: 6px 4px 4px;
    scrollbar-width: thin;
  }

  li {
    flex: none;
    position: relative;
  }

  .thumb,
  .add {
    border-radius: 6px;
    height: 3.75rem;
    overflow: hidden;
    padding: 0;
    width: 3.75rem;
  }

  .thumb :global(img) {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .thumb[aria-pressed="true"] {
    box-shadow:
      0 0 0 2px var(--page),
      0 0 0 4px var(--accent);
  }

  .add {
    background: transparent;
    border: 1.5px dashed var(--line);
    color: var(--muted);
  }

  .add:hover {
    border-color: var(--muted);
    color: var(--ink);
  }

  /* Shown on hover and focus; always on touch screens, which can't hover. */
  .remove {
    background: var(--sheet);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--line);
    min-height: 1.4rem;
    min-width: 1.4rem;
    opacity: 0;
    position: absolute;
    right: -4px;
    top: -4px;
  }

  li:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }

  @media (hover: none) {
    .remove {
      opacity: 1;
    }
  }

  .caption {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.75rem;
    min-height: 2.25rem;
  }

  .name {
    font-weight: 550;
    overflow-wrap: anywhere;
  }

  .clear {
    color: var(--muted);
    margin-left: auto;
  }
</style>
