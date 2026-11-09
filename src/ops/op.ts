/**
 * The operation contract: every tool is one operation, and a chain is a list
 * of steps, each an operation with its settings. An operation declares its
 * settings schema once (the UI generates its form from it) and a `run` that
 * the engine calls on full-size images (processing) and on downscaled copies
 * (live preview), the same code for both.
 */

import type { Schema, Values } from '../core/params';
import type { Img } from '../engine/canvas';
import type { Picture } from '../engine/encode';

export interface Step {
  /** Unique within the page, for keyed lists in the UI. */
  id: string;
  op: string;
  params: Record<string, unknown>;
}

export interface RunContext {
  /**
   * Size of the image being processed relative to the full-size original:
   * 1 when processing, below 1 for previews. Operations multiply settings
   * given in pixels (blur radius, margins, target sizes) by it.
   */
  scale: number;
  /** Absolute URL of a file the app serves (the OCR engine, see vite.config.ts). */
  asset(path: string): string;
}

interface Base<S extends Schema> {
  id: string;
  title: string;
  /** One line shown under the step's title. */
  description: string;
  /** Added to output file names, e.g. `photo-scaled.jpg`. */
  suffix: string;
  params: S;
  /** Slow and memory-hungry (OCR): a batch runs one image at a time. */
  heavy?: boolean;
}

/** Changes the pixels: one image in, one image out. */
export interface MapOp<S extends Schema = Schema> extends Base<S> {
  kind: 'map';
  run(image: Img, values: Values<S>, context: RunContext): Img | Promise<Img>;
}

/**
 * Changes how the image is saved (Convert format, Compress, Strip metadata),
 * and writes the file right away so later steps and the preview see the
 * result.
 */
export interface FileOp<S extends Schema = Schema> extends Base<S> {
  kind: 'file';
  run(
    picture: Picture,
    values: Values<S>,
    context: RunContext,
  ): Promise<Picture>;
}

/** All images in, one image out (Merge images). */
export interface CombineOp<S extends Schema = Schema> extends Base<S> {
  kind: 'combine';
  run(
    images: Img[],
    values: Values<S>,
    context: RunContext,
  ): Img | Promise<Img>;
}

/**
 * Ends the chain with something other than an image (OCR text, SVG), so it
 * must be the last step, and the live preview stops before it.
 */
export interface FinalOp<S extends Schema = Schema> extends Base<S> {
  kind: 'final';
  run(image: Img, values: Values<S>, context: RunContext): Promise<Blob>;
}

export type Op = MapOp | FileOp | CombineOp | FinalOp;

/** Typed helpers: the `values` passed to `run` follow the schema. */
export function mapOp<S extends Schema>(op: MapOp<S>): Op {
  return op as unknown as Op;
}
export function fileOp<S extends Schema>(op: FileOp<S>): Op {
  return op as unknown as Op;
}
export function combineOp<S extends Schema>(op: CombineOp<S>): Op {
  return op as unknown as Op;
}
export function finalOp<S extends Schema>(op: FinalOp<S>): Op {
  return op as unknown as Op;
}
