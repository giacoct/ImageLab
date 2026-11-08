/**
 * Light/dark theme: the user's choice ("system" follows the device), kept in
 * localStorage and applied as `data-theme` on <html>, which styles.css turns
 * into the color scheme. index.html applies the saved choice before the first
 * paint (keep the storage key in sync), so the page never flashes the wrong
 * theme.
 */

import { load, remove, save } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'theme';

function stored(): ThemePreference {
  const value = load(KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

class Theme {
  preference = $state<ThemePreference>(stored());

  set(preference: ThemePreference): void {
    this.preference = preference;
    if (preference === 'system') remove(KEY);
    else save(KEY, preference);
    const root = document.documentElement;
    if (preference === 'system') delete root.dataset.theme;
    else root.dataset.theme = preference;
  }
}

export const theme = new Theme();
