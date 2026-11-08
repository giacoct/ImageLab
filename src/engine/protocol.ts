/** Messages between the main thread (`client.ts`) and the engine worker (`worker.ts`). */

import type { Step } from '../ops/op';
import type { Inspection, Output, PreviewRequest } from './pipeline';

export interface Requests {
  inspect: { args: { blob: Blob }; result: Inspection };
  process: { args: { input: { name: string; blob: Blob }; steps: Step[] }; result: Output };
  preview: { args: PreviewRequest; result: ImageBitmap };
}

export type RequestType = keyof Requests;

export type RequestMessage = {
  [K in RequestType]: { id: number; type: K; args: Requests[K]['args'] };
}[RequestType];

export type ResponseMessage =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
