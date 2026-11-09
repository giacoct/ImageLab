<!--
  An <img> showing a Blob. Owns the object URL: created when the blob is set,
  revoked when it changes or the component goes away, so callers never leak.
-->
<script lang="ts">
  let {
    blob,
    alt,
    class: className = "",
  }: { blob: Blob; alt: string; class?: string } = $props();

  let url = $state<string>();

  $effect(() => {
    const objectUrl = URL.createObjectURL(blob);
    url = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  });
</script>

{#if url}
  <img src={url} {alt} class={className} decoding="async" />
{/if}
