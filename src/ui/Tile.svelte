<!-- An icon on a small square patch of its tool's chart color (see patches.ts). -->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { patchOf, type Patch } from './patches';

  let { icon, patch, small = false }: { icon: string; patch?: Patch; small?: boolean } = $props();

  const shown = $derived(patch ?? patchOf(icon));
</script>

<span class="tile ink-{shown.ink}" class:small style:--patch={shown.color}>
  <Icon name={icon} size={small ? 16 : 20} />
</span>
