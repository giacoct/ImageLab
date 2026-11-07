/**
 * The pipeline model. A recipe is an ordered list of steps (operation id +
 * its settings) ending in one export step that encodes the result. Every
 * tool on the home page is a preset recipe; the user can add, remove and
 * reorder steps, and save the result as a recipe of their own.
 */

import { p, sanitize, type ParamContext, type Values } from './params';

export interface Step {
  /** Stable id within the recipe (for keyed lists in the UI). */
  id: string;
  op: string;
  params: Record<string, unknown>;
}

const LOSSY = new Set(['same', 'jpeg', 'webp', 'avif']);

/** Settings of the export step, shared by every recipe. */
export const EXPORT_PARAMS = {
  format: p.choice({
    label: 'Format',
    default: 'same',
    display: 'select',
    options: [
      {
        value: 'keep',
        label: 'Original file, metadata removed',
        // Only meaningful when no step changes the pixels.
        when: (context: ParamContext) => !context.hasSteps,
      },
      { value: 'same', label: 'Same format as the input' },
      { value: 'jpeg', label: 'JPEG' },
      { value: 'png', label: 'PNG' },
      { value: 'webp', label: 'WebP' },
      { value: 'avif', label: 'AVIF' },
      { value: 'ico', label: 'ICO icon' },
    ],
  }),
  sizing: p.choice({
    label: 'Compression',
    default: 'quality',
    options: [
      { value: 'quality', label: (v) => (v.format === 'png' ? 'Full size' : 'Fixed quality') },
      { value: 'target', label: 'Target file size' },
    ],
    when: (v) => v.format !== 'keep' && v.format !== 'ico',
  }),
  quality: p.number({
    label: 'Quality',
    default: 90,
    min: 10,
    max: 100,
    unit: '%',
    hint: 'Ignored for PNG, which is lossless.',
    when: (v) => v.sizing === 'quality' && LOSSY.has(v.format as string),
  }),
  targetKb: p.number({
    label: 'Target size',
    default: 500,
    min: 10,
    max: 50_000,
    step: 10,
    unit: 'KB',
    slider: false,
    hint: 'Lowers the quality (PNG: the dimensions) until each file fits.',
    when: (v) => v.sizing === 'target' && v.format !== 'keep' && v.format !== 'ico',
  }),
  icoSize: p.number({
    label: 'Icon size',
    default: 256,
    min: 16,
    max: 256,
    unit: 'px',
    when: (v) => v.format === 'ico',
  }),
};

export type ExportSettings = Values<typeof EXPORT_PARAMS>;

export interface Recipe {
  steps: Step[];
  export: ExportSettings;
}

export function exportContext(steps: readonly Step[]): ParamContext {
  return { hasSteps: steps.length > 0 };
}

/** Export settings valid for this list of steps (e.g. no "keep file" once pixels change). */
export function sanitizeExport(raw: unknown, steps: readonly Step[]): ExportSettings {
  return sanitize(EXPORT_PARAMS, raw, exportContext(steps));
}

let nextId = 0;

/** A fresh step id, unique within this page load. */
export function stepId(): string {
  nextId += 1;
  return `s${Date.now().toString(36)}${nextId}`;
}
