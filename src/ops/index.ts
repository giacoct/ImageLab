/** Every tool (one operation each), in the order the home page lists them. */

import { adjust } from "./adjust";
import { compress } from "./compress";
import { convert } from "./convert";
import { margin } from "./margin";
import { merge } from "./merge";
import { ocr } from "./ocr";
import type { Op } from "./op";
import { removeBackground } from "./remove-background";
import { scale } from "./scale";
import { stripMetadata } from "./strip-metadata";
import { transform } from "./transform";
import { vectorize } from "./vectorize";

export const OPS: readonly Op[] = [
  transform,
  scale,
  adjust,
  removeBackground,
  margin,
  merge,
  convert,
  compress,
  stripMetadata,
  vectorize,
  ocr,
];

const BY_ID = new Map(OPS.map((op) => [op.id, op]));

export function getOp(id: string): Op {
  const op = BY_ID.get(id);
  if (!op) throw new Error(`Unknown operation: ${id}`);
  return op;
}
