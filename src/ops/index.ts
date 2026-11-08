/** Every tool (one operation each), in the order the home page and "Add a step" list them. */

import { adjust } from './adjust';
import { compress } from './compress';
import { convert } from './convert';
import { margin } from './margin';
import { merge } from './merge';
import { ocr } from './ocr';
import type { Op } from './op';
import { removeBackground } from './remove-background';
import { scale } from './scale';
import { stripMetadata } from './strip-metadata';
import { transform } from './transform';
import { upscale } from './upscale';
import { vectorize } from './vectorize';

export const OPS: readonly Op[] = [
  transform,
  scale,
  adjust,
  removeBackground,
  margin,
  merge,
  upscale,
  convert,
  compress,
  stripMetadata,
  vectorize,
  ocr,
];

const BY_ID = new Map(OPS.map((op) => [op.id, op]));

/** Look up an operation; `undefined` for ids from an older saved recipe. */
export function findOp(id: string): Op | undefined {
  return BY_ID.get(id);
}

/** Look up an operation that must exist (ids validated when the recipe was loaded). */
export function getOp(id: string): Op {
  const op = BY_ID.get(id);
  if (!op) throw new Error(`Unknown operation: ${id}`);
  return op;
}
