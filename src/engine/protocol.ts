/** Messages between the main thread (`client.ts`) and the engine worker (`worker.ts`). */

import type { Step } from '../ops/op';
import type { Input, Inspection, Output, PreviewRequest } from './pipeline';

export interface Requests {
  inspect: { args: { blob: Blob }; result: Inspection };
  process: { args: { inputs: Input[]; steps: Step[] }; result: Output[] };
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
