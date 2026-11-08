<!-- Light / system / dark theme switch: three icons in a pill, the chosen one raised. -->
<script lang="ts">
  import { theme, type ThemePreference } from '../app/theme.svelte';
  import Icon from './Icon.svelte';

  const OPTIONS: { value: ThemePreference; icon: string; label: string }[] = [
    { value: 'light', icon: 'sun', label: 'Light theme' },
    { value: 'system', icon: 'monitor', label: 'Same theme as the device' },
    { value: 'dark', icon: 'moon', label: 'Dark theme' },
  ];

  const index = $derived(OPTIONS.findIndex((option) => option.value === theme.preference));
</script>

<div class="switcher" role="group" aria-label="Theme" style:--index={index}>
  <span class="thumb" aria-hidden="true"></span>
  {#each OPTIONS as option (option.value)}
    <button
      type="button"
      class={option.value}
      aria-pressed={theme.preference === option.value}
      aria-label={option.label}
      title={option.label}
      onclick={(event) => theme.set(option.value, event.currentTarget)}
    >
      <Icon name={option.icon} size={15} />
    </button>
  {/each}
</div>

<style>
  .switcher {
    background: var(--tile);
    border-radius: 999px;
    display: grid;
    grid-template-columns: repeat(3, 1.9rem);
    padding: 0.18rem;
    position: relative;
  }

  .thumb {
    background: var(--panel);
    border-radius: 999px;
    box-shadow:
      0 1px 2px var(--shadow-color),
      0 0 0 1px var(--border);
    height: 1.9rem;
    left: 0.18rem;
    position: absolute;
    top: 0.18rem;
    transform: translateX(calc(var(--index) * 100%));
    transition: transform 380ms var(--spring);
    width: 1.9rem;
  }

  button {
    align-items: center;
    background: none;
    border: 0;
    border-radius: 999px;
    color: var(--soft);
    display: flex;
    height: 1.9rem;
    justify-content: center;
    padding: 0;
    position: relative;
    transition: color 200ms var(--ease);
  }

  button:hover,
  button[aria-pressed='true'] {
    color: var(--ink);
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
