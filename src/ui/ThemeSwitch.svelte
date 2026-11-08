<!--
  Light / system / dark theme switch, drawn as three patches of the chart's
  grey row: white, half and half, black. The chosen one stands out.
-->
<script lang="ts">
  import { theme, type ThemePreference } from '../app/theme.svelte';
  import Icon from './Icon.svelte';

  const OPTIONS: { value: ThemePreference; icon: string; label: string }[] = [
    { value: 'light', icon: 'sun', label: 'Light theme' },
    { value: 'system', icon: 'monitor', label: 'Same theme as the device' },
    { value: 'dark', icon: 'moon', label: 'Dark theme' },
  ];
</script>

<div class="switcher" role="group" aria-label="Theme">
  {#each OPTIONS as option (option.value)}
    <button
      type="button"
      class={option.value}
      aria-pressed={theme.preference === option.value}
      aria-label={option.label}
      title={option.label}
      onclick={(event) => theme.set(option.value, event.currentTarget)}
    >
      <Icon name={option.icon} size={13} />
    </button>
  {/each}
</div>

<style>
  /* A small tray of three swatches; the chosen one sits up, the others recede. */
  .switcher {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 2px;
    padding: 3px;
  }

  button {
    align-items: center;
    border: 1px solid rgb(0 0 0 / 0.12);
    border-radius: var(--radius-patch);
    display: flex;
    height: 1.6rem;
    justify-content: center;
    opacity: 0.5;
    padding: 0;
    scale: 0.82;
    transition:
      opacity 200ms var(--ease),
      scale 300ms var(--spring);
    width: 1.6rem;
  }

  button:hover {
    opacity: 0.85;
    scale: 0.92;
  }

  button[aria-pressed='true'] {
    opacity: 1;
    scale: 1;
  }

  .light {
    background: #f3f3f2;
    color: #343434;
  }

  .system {
    background: linear-gradient(135deg, #f3f3f2 50%, #343434 50%);
    color: #8a8a86;
  }

  .dark {
    background: #343434;
    border-color: #4a4a4a;
    color: #f3f3f2;
  }

  /* The chosen icon does a little turn: the sun spins, the moon rocks. */
  .light[aria-pressed='true'] :global(svg) {
    animation: turn 600ms var(--ease);
  }

  .dark[aria-pressed='true'] :global(svg) {
    animation: rock 600ms var(--ease);
  }

  .system[aria-pressed='true'] :global(svg) {
    animation: pop 400ms var(--ease);
  }

  @keyframes turn {
    from {
      transform: rotate(-90deg) scale(0.6);
    }
  }

  @keyframes rock {
    0% {
      transform: rotate(40deg) scale(0.6);
    }
    60% {
      transform: rotate(-12deg);
    }
  }
</style>
