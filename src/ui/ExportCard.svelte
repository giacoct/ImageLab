<!-- The export settings: format and compression, shared by every recipe. -->
<script lang="ts">
  import { session } from '../app/session.svelte';
  import { EXPORT_PARAMS, exportContext } from '../core/recipe';
  import ParamForm from './ParamForm.svelte';
</script>

<section class="section" aria-labelledby="export-title">
  <h2 id="export-title">Export</h2>
  {#if session.terminal}
    <p class="hint">
      {session.terminal.kind === 'svg'
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
      <p class="notice info">
        The image data is copied untouched (JPEG, PNG, WebP); only the metadata is removed. The
        color profile and the orientation stay.
      </p>
    {/if}
  {/if}
</section>
