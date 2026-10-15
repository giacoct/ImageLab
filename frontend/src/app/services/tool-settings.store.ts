import { Injectable } from '@angular/core';

const STORAGE_PREFIX = 'imagelab.settings.';

/**
 * Persists each tool's last-used settings in `localStorage` so they survive
 * reloads. Storage failures (private mode, quota, disabled storage) are
 * swallowed — persistence is a convenience, never a requirement.
 */
@Injectable({ providedIn: 'root' })
export class ToolSettingsStore {
  load(toolId: string): object | null {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + toolId);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  save(toolId: string, value: object): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + toolId, JSON.stringify(value));
    } catch {
      // Ignore: persistence is best-effort.
    }
  }
}
