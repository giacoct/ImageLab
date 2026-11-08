<!--
  The hidden file input behind every "Choose images" button: `open()` shows
  the system picker, and the chosen images go to the session.
-->
<script lang="ts">
  import { session } from '../app/session.svelte';

  let input: HTMLInputElement;

  export function open(): void {
    input.click();
  }
</script>

<input
  bind:this={input}
  class="visually-hidden"
  type="file"
  accept="image/*,.heic,.heif"
  multiple
  tabindex="-1"
  onchange={(event) => {
    session.addFiles(event.currentTarget.files ?? []);
    event.currentTarget.value = ''; // so choosing the same file again still counts
  }}
/>
