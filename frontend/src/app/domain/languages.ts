/**
 * Human-readable names for Tesseract language codes, e.g. `ita` → "Italian",
 * `chi_sim_vert` → "Chinese (simplified, vertical)". The base code is named by
 * the browser (`Intl.DisplayNames`); unknown codes are shown as-is.
 */

/** Tesseract's variant suffixes (`chi_sim`, `srp_latn`, `deu_latf`, ...). */
const VARIANTS: Record<string, string> = {
  sim: 'simplified',
  tra: 'traditional',
  vert: 'vertical',
  old: 'historic',
  cyrl: 'Cyrillic',
  latn: 'Latin',
  latf: 'Fraktur',
};

const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

export function languageLabel(code: string): string {
  const [base, ...variants] = code.split('_');
  let name: string | undefined;
  try {
    name = names.of(base);
  } catch {
    name = undefined; // not a valid language subtag
  }
  if (!name) {
    return code;
  }
  return variants.length === 0
    ? name
    : `${name} (${variants.map((variant) => VARIANTS[variant] ?? variant).join(', ')})`;
}
