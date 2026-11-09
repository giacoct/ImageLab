<!--
  What the tool made: the result images, to download one by one or all
  together, or to use as the images for another tool; or, for Extract text
  and Convert to SVG, the text (in full, to read and copy) and the SVGs.
-->
<script lang="ts">
  import Download from "@lucide/svelte/icons/download";

  import { downloadBlob, downloadZip } from "../app/download";
  import { session } from "../app/session.svelte";
  import { formatBytes } from "../core/files";
  import type { Output } from "../engine/pipeline";
  import type { Item } from "../app/session.svelte";
  import BlobImage from "./BlobImage.svelte";

  const FORMAT_NAMES: Record<string, string> = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/avif": "AVIF",
  };

  const count = $derived(session.results.length + session.outputs.length);
  let copied = $state<string | null>(null);

  // When results arrive, bring them into view: on a phone they'd otherwise
  // land below the settings, out of sight.
  let section = $state<HTMLElement>();
  let had = false;
  $effect(() => {
    const has = count > 0;
    if (has && !had && section) {
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.scrollIntoView({
        block: "nearest",
        behavior: still ? "auto" : "smooth",
      });
    }
    had = has;
  });

  async function copy(id: string, output: Output): Promise<void> {
    try {
      await navigator.clipboard.writeText(output.text ?? "");
      copied = id;
      setTimeout(() => (copied = null), 1500);
    } catch {
      // No clipboard access: the text box can still be selected and copied.
    }
  }

  function downloadAll(): void {
    if (session.results.length) void session.download(session.results);
    else
      void downloadZip(
        session.outputs.map(({ output }) => output),
        "imagelab.zip",
      );
  }

  /** Size and format of a result, and its file size once known. */
  function details(item: Item): string[] {
    const { version } = item;
    const parts = [
      `${version.width} × ${version.height}`,
      FORMAT_NAMES[version.encoding.format],
    ];
    if (version.file?.blob.type === version.encoding.format)
      parts.push(formatBytes(version.file.blob.size));
    return parts;
  }
</script>

{#if count}
  <section class="results" aria-labelledby="results-title" bind:this={section}>
    <div class="head">
      <h2 id="results-title">{count === 1 ? "Result" : `${count} results`}</h2>
      {#if session.stale}
        <p class="notice warning">
          The settings changed since. Apply again to update the results.
        </p>
      {/if}
    </div>

    {#if session.results.length}
      <ul>
        {#each session.results as item (item.id)}
          <li>
            <span class="thumb checker">
              <BlobImage blob={item.version.thumbnail} alt="" />
            </span>
            <span class="meta">
              <span class="name">{item.version.name}</span>
              <span class="hint numbers parts">
                {#each details(item) as part (part)}<span>{part}</span>{/each}
              </span>
            </span>
            <button
              class="icon quiet"
              type="button"
              aria-label="Download {item.version.name}"
              title="Download"
              disabled={session.saving}
              onclick={() => session.download([item])}
              ><Download size={18} /></button
            >
          </li>
        {/each}
      </ul>
    {/if}

    {#each session.outputs as { id, output } (id)}
      <article>
        <span class="name">{output.name}</span>
        {#if output.text !== undefined}
          {#if output.text}
            <textarea readonly aria-label="Text from {output.name}"
              >{output.text}</textarea
            >
          {:else}
            <p class="muted">No text was found.</p>
          {/if}
        {:else}
          <div class="svg checker">
            <BlobImage blob={output.thumbnail} alt={output.name} />
          </div>
        {/if}
        <div class="row">
          {#if output.text !== undefined}
            <button
              type="button"
              disabled={!output.text}
              onclick={() => copy(id, output)}
            >
              {copied === id ? "Copied" : "Copy text"}
            </button>
          {:else}
            <span class="hint numbers">{formatBytes(output.blob.size)}</span>
          {/if}
          <button
            type="button"
            onclick={() => downloadBlob(output.blob, output.name)}
          >
            <Download size={16} /> Download
          </button>
        </div>
      </article>
    {/each}

    <div class="row actions">
      {#if count > 1}
        <button type="button" disabled={session.saving} onclick={downloadAll}>
          <Download size={16} /> Download all
        </button>
      {:else if session.results.length === 1}
        <button
          type="button"
          disabled={session.saving}
          onclick={() => session.download(session.results)}
        >
          <Download size={16} /> Download
        </button>
      {/if}
      {#if session.results.length}
        <button
          type="button"
          title="Make the results the images for another tool"
          onclick={() => session.useResults()}
        >
          Use as input
        </button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .results {
    display: grid;
    gap: 0.75rem;
    /* Clear of the sticky viewer above and the Apply bar below. */
    scroll-margin: 50svh 0 6rem;
  }

  .head {
    display: grid;
    gap: 0.5rem;
  }

  h2 {
    font-size: var(--text-lead);
  }

  ul {
    display: grid;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    max-height: 18rem;
    overflow-y: auto;
    padding: 0;
  }

  li {
    align-items: center;
    display: flex;
    gap: 0.7rem;
  }

  .thumb {
    border-radius: 4px;
    flex: none;
    height: 2.75rem;
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
    flex: 1;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.6rem;
  }

  article {
    display: grid;
    gap: 0.5rem;
  }

  .svg {
    border-radius: var(--radius);
    display: flex;
    justify-content: center;
    max-height: 16rem;
    overflow: hidden;
  }

  .svg :global(img) {
    max-height: 16rem;
    object-fit: contain;
  }

  textarea {
    min-height: 10rem;
    resize: vertical;
    width: 100%;
  }

  .actions button {
    flex: 1;
  }
</style>
