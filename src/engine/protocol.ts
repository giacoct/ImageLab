/** Messages between the main thread (`client.ts`) and the engine worker (`worker.ts`). */

import type { Action } from '../ops/op';
import type { Output, PreviewRequest, Saved, Version } from './pipeline';

export interface Requests {
  open: { args: { blob: Blob; name: string }; result: Version };
  apply: { args: { inputs: Version[]; action: Action }; result: Version[] };
  finish: { args: { input: Version; action: Action }; result: Output };
  save: { args: { version: Version }; result: Saved };
  preview: { args: PreviewRequest; result: ImageBitmap };
}

export type RequestType = keyof Requests;

export type RequestMessage = {
  [K in RequestType]: {
    id: number;
    type: K;
    /** Where the app is served from, to locate the files it serves (the OCR engine). */
    appUrl: string;
    args: Requests[K]['args'];
  };
}[RequestType];

export type ResponseMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };
