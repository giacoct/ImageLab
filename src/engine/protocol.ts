/** Messages between the main thread (`client.ts`) and the engine worker (`worker.ts`). */

import type { ColorSpace } from "../core/color";
import type { Action } from "../ops/op";
import type {
  DetailRequest,
  Output,
  PreviewRequest,
  Region,
  Saved,
  Version,
} from "./pipeline";

/** A rendered preview, and its size relative to the full-size result. */
export interface PreviewImage {
  bitmap: ImageBitmap;
  scale: number;
  /** The space its colors are in: a canvas showing it should be too. */
  colorSpace: ColorSpace;
}

/** A part of the full-size result, for a zoomed-in preview (see `renderDetail`). */
export interface DetailImage {
  bitmap: ImageBitmap;
  region: Region;
  density: number;
  colorSpace: ColorSpace;
}

export interface Requests {
  open: { args: { blob: Blob; name: string }; result: Version };
  apply: { args: { inputs: Version[]; action: Action }; result: Version[] };
  finish: { args: { input: Version; action: Action }; result: Output };
  save: { args: { version: Version }; result: Saved };
  background: { args: { version: Version }; result: string };
  preview: { args: PreviewRequest; result: PreviewImage };
  detail: { args: DetailRequest; result: DetailImage };
}

export type RequestType = keyof Requests;

export type RequestMessage = {
  [K in RequestType]: {
    id: number;
    type: K;
    /** Where the app is served from, to locate the files it serves (the OCR engine). */
    appUrl: string;
    args: Requests[K]["args"];
  };
}[RequestType];

export type ResponseMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  /** How far a slow request is, 0–1, before its result. */
  | { id: number; progress: number };
