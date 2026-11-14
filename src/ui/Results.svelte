<!--
  What the tool made: the result images, to download one by one or all
  together, to share, or to use as the images for another tool; or, for
  Extract text and Convert to SVG, the text (in full, to read and copy) and
  the SVGs. Share is there where the browser can share files. A card in
  the tool's color, so the results stand out from the settings; grey once
  the settings changed since.
-->
<script lang="ts">
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Download from "@lucide/svelte/icons/download";
  import Share from "@lucide/svelte/icons/share";

  import { downloadBlob, downloadZip } from "../app/download";
  import { goHome } from "../app/router";
  import { session } from "../app/session.svelte";
  import { canShareFiles, shareFiles } from "../app/share";
  import {
    extensionFor,
    formatBytes,
    imageDetails,
    outputName,
    stemOf,
  } from "../core/files";
  import type { Output } from "../engine/pipeline";
  import type { Item } from "../app/session.svelte";
  import BlobImage from "./BlobImage.svelte";
  import FileName from "./FileName.svelte";

  const count = $derived(session.results.length + session.outputs.length);
  const canShare = canShareFiles();
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

  /** The file of a text or SVG, if the browser can share it. */
  function shareable(output: Output): File | null {
    const file = new File([output.blob], output.name, {
      type: output.blob.type.split(";")[0],
    });
    return canShare && canShareFiles([file]) ? file : null;
  }

  function downloadAll(): void {
    if (session.results.length) void session.download(session.results);
    else
      void downloadZip(
        session.outputs.map(({ output }) => output),
        "imagelab.zip",
      );
  }

  /** The name a result's file gets: its stem (to change) and extension. */
  function fileName(item: Item): { stem: string; extension: string } {
    const { version } = item;
    const extension = extensionFor(version.encoding.format);
    return {
      stem: stemOf(outputName(version.name, version.suffix, extension)),
      extension,
    };
  }

  /** `photo-text.txt` → `photo-text` and `txt`. */
  function parts(name: string): { stem: string; extension: string } {
    const stem = stemOf(name);
    return { stem, extension: name.slice(stem.length + 1) };
  }
</script>

{#if count}
  <section
    class="results"
    class:stale={session.stale}
    aria-labelledby="results-title"
    bind:this={section}
  >
    <div class="head">
      <h2 id="results-title">
        <CircleCheck size={20} />
        {count === 1 ? "Result" : `${count} results`}
      </h2>
      {#if session.stale}
        <p class="notice warning">
          The settings changed since. Apply again to update the results.
        </p>
      {/if}
    </div>

    {#if session.results.length}
      <ul>
        {#each session.results as item (item.id)}
          {@const name = fileName(item)}
          <li>
            <span class="thumb checker">
              <BlobImage blob={item.version.thumbnail} alt="" />
            </span>
            <span class="meta">
              <FileName
                {...name}
                onrename={(stem) => session.renameResult(item.id, stem)}
              />
              <span class="hint numbers parts">
                {#each imageDetails(item.version) as part (part)}<span
                    >{part}</span
                  >{/each}
              </span>
            </span>
            <button
              class="icon quiet"
              type="button"
              aria-label="Download {name.stem}.{name.extension}"
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
      {@const file = shareable(output)}
      <article>
        <FileName
          {...parts(output.name)}
          onrename={(stem) => session.renameOutput(id, stem)}
        />
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
          {#if file}
            <button
              type="button"
              onclick={() => shareFiles([file]).catch(() => {})}
            >
              <Share size={16} /> Share
            </button>
          {/if}
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
      {#if canShare && session.results.length}
        <button
          type="button"
          disabled={session.sharing === "saving"}
          onclick={() => session.share(session.results)}
        >
          <Share size={16} />
          {session.sharing === "saving"
            ? "Preparing…"
            : session.sharing === "ready"
              ? "Tap to share"
              : "Share"}
        </button>
      {/if}
      {#if session.results.length}
        <button
          type="button"
          title="Make the results the images for another tool"
          onclick={() => {
            session.useResults();
            goHome();
          }}
        >
          Use as input
        </button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .results {
    animation: arrive 0.6s ease-out;
    background: color-mix(in oklab, var(--accent-soft) 55%, var(--sheet));
    border: 1.5px solid var(--accent);
    border-radius: calc(var(--radius) * 1.5);
    display: grid;
    gap: 0.75rem;
    padding: 0.9rem;
    /* Clear of the Apply bar below. */
    scroll-margin: 1rem 0 6rem;
  }

  .results button:not(.quiet):not(:hover) {
    background: var(--sheet);
  }

  .results.stale {
    background: var(--sheet);
    border-color: var(--line);
  }

  /* A glow in the tool's color as the results come in. */
  @keyframes arrive {
    from {
      box-shadow: 0 0 0 6px color-mix(in oklab, var(--accent) 35%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .results {
      animation: none;
    }
  }

  .head {
    display: grid;
    gap: 0.5rem;
  }

  h2 {
    align-items: center;
    color: var(--accent);
    display: flex;
    font-size: var(--text-lead);
    gap: 0.4rem;
  }

  .stale h2 {
    color: var(--muted);
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
