<!-- The export step: output format and compression, shared by every recipe. -->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { EXPORT_PARAMS, exportContext } from '../core/recipe';
  import Icon from './Icon.svelte';
  import ParamForm from './ParamForm.svelte';

  const terminal = $derived(session.ops.find((op) => op.kind === 'svg' || op.kind === 'text'));
</script>

<section class="panel export" aria-labelledby="export-title">
  <h2 class="panel-title" id="export-title"><Icon name="download" />Save as</h2>
  {#if terminal}
    <p class="hint">
      {terminal.kind === 'svg'
        ? 'SVG files (scalable vectors).'
        : 'Plain text, selectable on the image.'}
    </p>
  {:else}
    <ParamForm
      schema={EXPORT_PARAMS}
      values={session.exportSettings}
      context={exportContext(session.steps)}
      idPrefix="export"
      onchange={(key, value) => session.setExport(key, value)}
    />
    {#if session.exportSettings.format === 'keep'}
      <p class="hint">
        The image data is copied untouched (JPEG, PNG, WebP); only the metadata is removed. The
        color profile and the orientation stay.
      </p>
    {/if}
  {/if}
</section>

<style>
  .export {
    display: grid;
    gap: 0.85rem;
  }
</style>
