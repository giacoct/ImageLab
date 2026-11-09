<!--
  Images can be dropped or pasted anywhere on the page. While files are
  dragged over the window an overlay says so; dropping adds them. Drags that
  carry no files (e.g. selected text) are ignored.
-->
<script lang="ts">
  import { session } from "../app/session.svelte";

  let visible = $state(false);
  // dragenter/dragleave fire for every element crossed; count to know when the drag left the window.
  let depth = 0;

  const carriesFiles = (event: DragEvent) =>
    event.dataTransfer?.types.includes("Files") ?? false;

  function onPaste(event: ClipboardEvent): void {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    void session.addFiles(files);
  }
</script>

<svelte:window
  onpaste={onPaste}
  ondragenter={(event) => {
    if (!carriesFiles(event)) return;
    depth += 1;
    visible = true;
  }}
  ondragleave={(event) => {
    if (!carriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) visible = false;
  }}
  ondragover={(event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }}
  ondrop={(event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    visible = false;
    if (event.dataTransfer?.files.length)
      void session.addFiles(event.dataTransfer.files);
  }}
/>

{#if visible}
  <div class="overlay">Drop to add images</div>
{/if}

<style>
  .overlay {
    align-items: center;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    border: 3px dashed var(--accent);
    display: flex;
    font-size: 1.3rem;
    font-weight: 600;
    inset: 0.5rem;
    justify-content: center;
    pointer-events: none;
    position: fixed;
    z-index: 100;
  }
</style>
