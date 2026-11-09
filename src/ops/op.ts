/**
 * The operation contract: every tool is one operation. Applying a tool runs
 * its operation, with the chosen settings, on all the loaded images; the
 * results can be saved or taken further by another tool. An operation
 * declares its settings schema once (the UI generates its form from it) and
 * a `run` that the engine calls on full-size images (applying) and on
 * downscaled copies (live preview), the same code for both. The one
 * exception is Adjust & filters, previewed on the GPU so its sliders
 * respond within the frame (`engine/live.ts`, tested against `run`).
 */

import type { Schema, Values } from "../core/params";
import type { Img } from "../engine/canvas";
import type { Picture } from "../engine/encode";

/** A tool with its settings, as the UI asks the engine to apply it. */
export interface Action {
  op: string;
  params: Record<string, unknown>;
}

export interface RunContext {
  /**
   * Size of the image being processed relative to the full-size original:
   * 1 when applying, below 1 for previews. Operations multiply settings
   * given in pixels (blur radius, margins, target sizes) by it.
   */
  scale: number;
  /** Absolute URL of a file the app serves (the OCR engine, see vite.config.ts). */
  asset(path: string): string;
  /**
   * How far the run is through this image, 0–1, for the progress bar. Only
   * slow tools report it (Upscale, OCR); the others are done in a blink.
   */
  progress?(fraction: number): void;
}

interface Base<S extends Schema> {
  id: string;
  title: string;
  /** One line shown under the tool's title. */
  description: string;
  /** Added to output file names, e.g. `photo-scaled.jpg`. */
  suffix: string;
  params: S;
  /**
   * Slow and memory-hungry (OCR, Upscale): a batch runs one image at a
   * time, and the preview shows the image it starts from.
   */
  heavy?: boolean;
}

/** Changes the pixels: one image in, one image out. */
export interface MapOp<S extends Schema = Schema> extends Base<S> {
  kind: "map";
  run(image: Img, values: Values<S>, context: RunContext): Img | Promise<Img>;
}

/**
 * Changes how the image is saved (Convert format, Compress, Strip metadata),
 * not its pixels. It writes the file right away, so its size is known and the
 * preview shows the result, compression artifacts included; the next tool
 * still starts from the untouched pixels.
 */
export interface FileOp<S extends Schema = Schema> extends Base<S> {
  kind: "file";
  run(
    picture: Picture,
    values: Values<S>,
    context: RunContext,
  ): Promise<Picture>;
}

/** All images in, one image out (Merge images). */
export interface CombineOp<S extends Schema = Schema> extends Base<S> {
  kind: "combine";
  run(
    images: Img[],
    values: Values<S>,
    context: RunContext,
  ): Img | Promise<Img>;
}

/**
 * Turns the image into something else (OCR text, SVG): its results can be
 * saved but not taken further, and the live preview shows the image it
 * starts from.
 */
export interface FinalOp<S extends Schema = Schema> extends Base<S> {
  kind: "final";
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
