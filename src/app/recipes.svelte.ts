/**
 * Recipes: a tool's starting steps, the user's last-used settings per tool,
 * and the user's own saved recipes — all kept in localStorage and validated
 * against the current operation schemas when read back.
 */

import { defaults, sanitize } from '../core/params';
import {
  EXPORT_PARAMS,
  sanitizeExport,
  stepId,
  type ExportSettings,
  type Step,
} from '../core/recipe';
import { findOp } from '../ops';
import { load, remove, save } from './storage';
import type { Tool } from './tools';

export interface SavedRecipe {
  id: string;
  title: string;
  steps: Step[];
  export: ExportSettings;
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

/** The tool's preset recipe, ignoring anything saved. */
export function toolDefaults(tool: Tool): { steps: Step[]; export: ExportSettings } {
  const steps = tool.steps.map((s) => newStep(s.op, s.params));
  return { steps, export: sanitizeExport({ ...defaults(EXPORT_PARAMS), ...tool.export }, steps) };
}

/** The tool's recipe as the user last left it, or its preset. */
export function toolRecipe(tool: Tool): { steps: Step[]; export: ExportSettings } {
  const saved = load(`tool:${tool.id}`) as { steps?: unknown; export?: unknown } | undefined;
  if (!saved) return toolDefaults(tool);
  const steps = sanitizeSteps(saved.steps);
  return { steps, export: sanitizeExport(saved.export, steps) };
}

export function saveToolRecipe(
  toolId: string,
  recipe: { steps: Step[]; export: ExportSettings },
): void {
  save(`tool:${toolId}`, recipe);
}

export function forgetToolRecipe(toolId: string): void {
  remove(`tool:${toolId}`);
}

function readSaved(): SavedRecipe[] {
  const raw = load('recipes');
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): SavedRecipe[] => {
    if (typeof entry?.id !== 'string' || typeof entry?.title !== 'string') return [];
    const steps = sanitizeSteps(entry.steps);
    return [
      { id: entry.id, title: entry.title, steps, export: sanitizeExport(entry.export, steps) },
    ];
  });
}

class Recipes {
  list = $state<SavedRecipe[]>(readSaved());

  find(id: string): SavedRecipe | undefined {
    return this.list.find((recipe) => recipe.id === id);
  }

  add(title: string, steps: Step[], settings: ExportSettings): SavedRecipe {
    const recipe = { id: crypto.randomUUID().slice(0, 8), title, steps, export: settings };
    this.list.push(recipe);
    this.persist();
    return recipe;
  }

  update(id: string, steps: Step[], settings: ExportSettings): void {
    const recipe = this.find(id);
    if (!recipe) return;
    recipe.steps = steps;
    recipe.export = settings;
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
