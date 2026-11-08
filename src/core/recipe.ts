/**
 * The chain model. A recipe is an ordered list of steps, each a tool (an
 * operation id) with its settings. Opening a tool starts a chain with that
 * tool alone; any tool can be added after it, any number of times, and the
 * user can save a chain as a recipe of their own.
 */

export interface Step {
  /** Stable id within the recipe (for keyed lists in the UI). */
  id: string;
  op: string;
  params: Record<string, unknown>;
}

let nextId = 0;

/** A fresh step id, unique within this page load. */
export function stepId(): string {
  nextId += 1;
  return `s${Date.now().toString(36)}${nextId}`;
}
