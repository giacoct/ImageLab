import { describe, expect, it } from 'vitest';

import { languageLabel } from './languages';

describe('languageLabel', () => {
  it('names plain ISO 639-2 codes', () => {
    expect(languageLabel('eng')).toBe('English');
    expect(languageLabel('ita')).toBe('Italian');
  });

  it('spells out variant suffixes', () => {
    expect(languageLabel('chi_sim_vert')).toBe('Chinese (simplified, vertical)');
    expect(languageLabel('srp_latn')).toBe('Serbian (Latin)');
  });

  it('falls back to the code when the browser has no name for it', () => {
    expect(languageLabel('frk')).toBe('frk');
    expect(languageLabel('snum')).toBe('snum');
  });
});
