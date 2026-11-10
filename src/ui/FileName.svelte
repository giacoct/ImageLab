<!--
  A result's file name, to change before downloading: it reads as text until
  it's tapped or clicked, and the extension stays (the format decides it).
  Enter or leaving the field keeps the new name, Escape restores the old one.
-->
<script lang="ts">
  import Pencil from "@lucide/svelte/icons/pencil";

  let {
    stem,
    extension,
    onrename,
  }: {
    /** The name without its extension. */
    stem: string;
    extension: string;
    onrename: (stem: string) => void;
  } = $props();
</script>

<label class="file-name">
  <input
    value={stem}
    aria-label="File name, before .{extension}"
    spellcheck="false"
    autocomplete="off"
    onchange={(event) => {
      onrename(event.currentTarget.value);
      // Show the name kept (cleaned up, or the old one when nothing was left).
      event.currentTarget.value = stem;
    }}
    onkeydown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      else if (event.key === "Escape") {
        event.currentTarget.value = stem;
        event.currentTarget.blur();
      }
    }}
  />
  <span class="extension">.{extension}</span>
  <span class="pencil" aria-hidden="true"><Pencil size={14} /></span>
</label>

<style>
  .file-name {
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius);
    cursor: text;
    display: flex;
    margin-left: -0.4rem;
    min-width: 0;
    padding: 0 0.4rem;
  }

  .file-name:hover {
    border-color: var(--line);
  }

  .file-name:focus-within {
    background: var(--sheet);
    border-color: var(--accent);
  }

  input {
    background: transparent;
    border: 0;
    border-radius: 0;
    field-sizing: content;
    font-weight: 550;
    min-height: 1.9rem;
    min-width: 2ch;
    outline: none;
    padding: 0;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .extension {
    color: var(--muted);
    flex: none;
  }

  .pencil {
    color: var(--muted);
    display: flex;
    flex: none;
    margin-left: auto;
    padding-left: 0.4rem;
  }
</style>
