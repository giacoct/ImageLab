<!-- An icon on a rounded tile tinted with the icon's own hue (see hues.ts). -->
<script lang="ts">
  import { hueOf } from './hues';
  import Icon from './Icon.svelte';

  let { icon, hue, small = false }: { icon: string; hue?: number; small?: boolean } = $props();
</script>

<span class="tile" class:small style:--hue={hue ?? hueOf(icon)}>
  <Icon name={icon} size={small ? 16 : 20} />
</span>
