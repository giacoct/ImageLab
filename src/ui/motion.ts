/**
 * Svelte transitions run in JavaScript, so the CSS reduced-motion rule in
 * styles.css doesn't reach them: they take their durations from here.
 */

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/** `duration` in milliseconds, or 0 when the user asked for less motion. */
export function ms(duration: number): number {
  return reduced.matches ? 0 : duration;
}
