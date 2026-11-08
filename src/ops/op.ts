/**
 * The operation contract: every tool is one operation. It declares its
 * settings schema once and a `run` over OffscreenCanvas images; the UI
 * generates its form from the schema, and the engine runs it on full-size
 * images (processing) and on downscaled copies (live preview), the same code
 * for both.
 */

import type { Size } from '../core/geometry';
import type { OcrPage } from '../core/ocr';
import type { Schema, Values } from '../core/params';
import type { Img } from '../engine/canvas';
import type { Picture } from '../engine/encode';

export interface RunContext {
  /**
   * Size of the image being processed relative to the full-size original:
   * 1 when processing, below 1 for previews. Operations multiply settings given
   * in pixels (margins, blur radius, target sizes) by it.
   */
  scale: number;
  /** Absolute URL of a file the app serves (model weights, vendored WASM). */
  asset(path: string): string;
}

interface Base<S extends Schema> {
  id: string;
  title: string;
  /** One line for the tool list and the step picker. */
  description: string;
  /** Added to output file names, e.g. `photo-scaled.jpg`. */
  suffix: string;
  params: S;
  /**
   * Slow, memory-hungry operations (ML models): run one file at a time, and
   * stop the live preview before them.
   */
  heavy?: boolean;
  /** Why this input can't be processed (shown before running), or null. */
  check?(size: Size, values: Values<S>): string | null;
}

/** One image in, one image out. */
export interface MapOp<S extends Schema = Schema> extends Base<S> {
  kind: 'map';
  /**
   * Clicking the preview picks a color from this step's input into the named
   * setting (the background color to key out).
   */
  pickColor?: keyof S & string;
  run(image: Img, values: Values<S>, context: RunContext): Img | Promise<Img>;
}

/** All images in, one image out (merge). */
export interface CombineOp<S extends Schema = Schema> extends Base<S> {
  kind: 'combine';
  minInputs: number;
  run(images: Img[], values: Values<S>, context: RunContext): Img | Promise<Img>;
}

/**
 * Works on the file rather than the pixels (Convert format, Compress, Strip
 * metadata): sets how the image is saved, and may write the file right away.
 */
export interface FileOp<S extends Schema = Schema> extends Base<S> {
  kind: 'file';
  run(picture: Picture, values: Values<S>, context: RunContext): Promise<Picture>;
}

/** Terminal: image in, SVG markup out. */
export interface SvgOp<S extends Schema = Schema> extends Base<S> {
  kind: 'svg';
  run(image: Img, values: Values<S>, context: RunContext): Promise<string>;
}

/** Terminal: image in, recognized text out. */
export interface TextOp<S extends Schema = Schema> extends Base<S> {
  kind: 'text';
  run(image: Img, values: Values<S>, context: RunContext): Promise<OcrPage>;
}

export type Op = MapOp | CombineOp | FileOp | SvgOp | TextOp;

/** Terminal operations produce something other than an image, so nothing can follow them. */
export function isTerminal(op: Op): op is SvgOp | TextOp {
  return op.kind === 'svg' || op.kind === 'text';
}

/** The live preview runs the steps before the first slow or terminal one. */
export function stopsPreview(op: Op): boolean {
  return Boolean(op.heavy) || isTerminal(op);
}

/** Typed helpers: the `values` passed to `run` follow the schema. */
export function mapOp<S extends Schema>(op: MapOp<S>): Op {
  return op as unknown as Op;
}
export function combineOp<S extends Schema>(op: CombineOp<S>): Op {
  return op as unknown as Op;
}
export function fileOp<S extends Schema>(op: FileOp<S>): Op {
  return op as unknown as Op;
}
export function svgOp<S extends Schema>(op: SvgOp<S>): Op {
  return op as unknown as Op;
}
export function textOp<S extends Schema>(op: TextOp<S>): Op {
  return op as unknown as Op;
}
