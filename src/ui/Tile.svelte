<!-- An icon on a small neutral tile: steps, menus, the input and the output. -->
<script lang="ts">
  import Icon from './Icon.svelte';

  let { icon, small = false }: { icon: string; small?: boolean } = $props();
</script>

<span class="tile" class:small>
  <Icon name={icon} size={small ? 16 : 20} />
</span>
