<!--
  An <img> showing a Blob. Owns the object URL: created when the blob is set,
  revoked when it changes or the component goes away, so callers never leak.
-->
<script lang="ts">
  let { blob, alt }: { blob: Blob; alt: string } = $props();

  let url = $state<string>();

  $effect(() => {
    const objectUrl = URL.createObjectURL(blob);
    url = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  });
</script>

{#if url}
  <img src={url} {alt} decoding="async" />
{/if}
