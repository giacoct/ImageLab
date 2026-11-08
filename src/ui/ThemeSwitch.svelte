<!--
  Light / system / dark theme switch, drawn as three patches of the chart's
  grey row: white, half and half, black. The chosen one is ringed.
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
      <Icon name={option.icon} size={14} />
    </button>
  {/each}
</div>

<style>
  .switcher {
    display: flex;
    gap: 0.4rem;
  }

  button {
    align-items: center;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-patch);
    display: flex;
    height: 1.9rem;
    justify-content: center;
    padding: 0;
    position: relative;
    transition:
      transform 200ms var(--ease),
      box-shadow 200ms var(--ease);
    width: 1.9rem;
  }

  .light {
    background: #f3f3f2;
    color: #343434;
  }

  .system {
    background: linear-gradient(135deg, #f3f3f2 50%, #343434 50%);
    color: #7a7a79;
  }

  .dark {
    background: #343434;
    border-color: #343434;
    color: #f3f3f2;
  }

  button:hover {
    transform: translateY(-1px);
  }

  button[aria-pressed='true'] {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 3.5px var(--ink);
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
