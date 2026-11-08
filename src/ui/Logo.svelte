<!--
  The mark: a picture split by a comparison handle, half solid color, half
  the transparency checkerboard. The same drawing is public/icon.svg.
-->
<script lang="ts">
  let { size = 30 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="9" fill="#3d3df5" />
  <path d="M16 0H23A9 9 0 0 1 32 9V23A9 9 0 0 1 23 32H16Z" fill="#ffffff" />
  <path d="M16 0H24V8H16ZM24 8H32V16H24ZM16 16H24V24H16ZM24 24H32V32H24Z" fill="#d9d9e6" />
  <path d="M16 0H23A9 9 0 0 1 32 9V23A9 9 0 0 1 23 32H16Z" fill="none" />
  <rect x="15" y="0" width="2" height="32" fill="#ffffff" />
  <circle cx="16" cy="16" r="5" fill="#ffffff" />
  <circle cx="16" cy="16" r="5" fill="none" stroke="#18181b" stroke-opacity="0.18" />
</svg>
