/**
 * Chains: each tool's last-used chain and the user's own saved recipes, kept
 * in localStorage and validated against the current operation schemas when
 * read back.
 */

import { defaults, sanitize } from '../core/params';
import { stepId, type Step } from '../core/recipe';
import { findOp } from '../ops';
import type { Op } from '../ops/op';
import { load, remove, save } from './storage';

export interface SavedRecipe {
  id: string;
  title: string;
  steps: Step[];
}

/** Valid steps from untrusted data: unknown operations are dropped, settings sanitized. */
export function sanitizeSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): Step[] => {
    const op = typeof entry?.op === 'string' ? findOp(entry.op) : undefined;
    return op ? [{ id: stepId(), op: op.id, params: sanitize(op.params, entry.params) }] : [];
  });
}

/** A new step for `opId` with default settings plus `params`. */
export function newStep(opId: string, params: Record<string, unknown> = {}): Step {
  const op = findOp(opId);
  if (!op) throw new Error(`Unknown operation: ${opId}`);
  return {
    id: stepId(),
    op: op.id,
    params: sanitize(op.params, { ...defaults(op.params), ...params }),
  };
}

/** Last-used chains are stored per tool. */
const chainKey = (toolId: string) => `chain:${toolId}`;

/** A tool's starting chain: the tool alone, with default settings. */
export function toolDefaults(tool: Op): Step[] {
  return [newStep(tool.id)];
}

/** The tool's chain as the user last left it, or the tool alone. */
export function toolRecipe(tool: Op): Step[] {
  const steps = sanitizeSteps(load(chainKey(tool.id)));
  return steps.length ? steps : toolDefaults(tool);
}

export function saveToolRecipe(toolId: string, steps: Step[]): void {
  save(chainKey(toolId), steps);
}

export function forgetToolRecipe(toolId: string): void {
  remove(chainKey(toolId));
}

function readSaved(): SavedRecipe[] {
  const raw = load('recipes');
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): SavedRecipe[] => {
    if (typeof entry?.id !== 'string' || typeof entry?.title !== 'string') return [];
    return [{ id: entry.id, title: entry.title, steps: sanitizeSteps(entry.steps) }];
  });
}

class Recipes {
  list = $state<SavedRecipe[]>(readSaved());

  find(id: string): SavedRecipe | undefined {
    return this.list.find((recipe) => recipe.id === id);
  }

  add(title: string, steps: Step[]): SavedRecipe {
    const recipe = { id: crypto.randomUUID().slice(0, 8), title, steps };
    this.list.push(recipe);
    this.persist();
    return recipe;
  }

  update(id: string, steps: Step[]): void {
    const recipe = this.find(id);
    if (!recipe) return;
    recipe.steps = steps;
    this.persist();
  }

  remove(id: string): void {
    this.list = this.list.filter((recipe) => recipe.id !== id);
    this.persist();
  }

  private persist(): void {
    save('recipes', $state.snapshot(this.list));
  }
}

export const recipes = new Recipes();
