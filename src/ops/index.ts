/** Every tool (one operation each), in the order "Add a step" lists them. */

import { adjust } from './adjust';
import { compress } from './compress';
import { convert } from './convert';
import type { Op } from './op';
import { scale } from './scale';
import { transform } from './transform';

export const OPS: readonly Op[] = [transform, scale, adjust, convert, compress];

const BY_ID = new Map(OPS.map((op) => [op.id, op]));

export function getOp(id: string): Op {
  const op = BY_ID.get(id);
  if (!op) throw new Error(`Unknown operation: ${id}`);
  return op;
}
