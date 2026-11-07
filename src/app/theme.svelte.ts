/**
 * Light/dark theme: the user's choice ("system" follows the device), kept in
 * localStorage and applied as `data-theme` on <html>, which styles.css turns
 * into the color scheme. index.html applies the saved choice before the first
 * paint, so the page never flashes the wrong theme.
 */

import { tick } from 'svelte';

import { load, save } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'theme';
/** The page background in each theme, for the browser's toolbar (theme-color). */
const SURFACE = { light: '#f4f7f6', dark: '#1d1e23' };

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function stored(): ThemePreference {
  const value = load(KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

class Theme {
  preference = $state<ThemePreference>(stored());
  private systemIsDark = $state(systemDark.matches);

  readonly resolved = $derived<'light' | 'dark'>(
    this.preference === 'system' ? (this.systemIsDark ? 'dark' : 'light') : this.preference,
  );

  constructor() {
    systemDark.addEventListener('change', (event) => {
      this.systemIsDark = event.matches;
      this.apply();
    });
    this.apply();
  }

  /**
   * Switch theme. When the colors change, the new theme spreads out in a
   * circle from `origin` (the button pressed), where View Transitions exist.
   */
  set(preference: ThemePreference, origin?: Element): void {
    if (preference === this.preference) return;
    const after = preference === 'system' ? (this.systemIsDark ? 'dark' : 'light') : preference;
    const change = async () => {
      this.preference = preference;
      save(KEY, preference);
      this.apply();
      await tick();
    };
    if (after === this.resolved || reducedMotion.matches || !document.startViewTransition) {
      void change();
      return;
    }

    const box = origin?.getBoundingClientRect();
    const x = box ? box.left + box.width / 2 : innerWidth / 2;
    const y = box ? box.top + box.height / 2 : 0;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(change);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 550,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {
        // Skipped transition: the theme still changed.
      });
  }

  private apply(): void {
    const root = document.documentElement;
    if (this.preference === 'system') delete root.dataset.theme;
    else root.dataset.theme = this.preference;
    // index.html has one theme-color per system scheme; both show the chosen theme.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
      meta.setAttribute('content', SURFACE[this.resolved]);
  }
}

export const theme = new Theme();
