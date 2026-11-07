/** Messages between the main thread (`client.ts`) and the engine worker (`worker.ts`). */

import type { Step } from '../core/recipe';
import type { Inspection, Input, JobRecipe, Output, PreviewFile } from './pipeline';

export interface Requests {
  inspect: { args: { blob: Blob }; result: Inspection };
  process: { args: { inputs: Input[]; recipe: JobRecipe }; result: Output[] };
  preview: {
    args: { files: PreviewFile[]; selected: number; steps: Step[]; maxSide: number };
    result: { bitmap: ImageBitmap };
  };
  sample: {
    args: { files: PreviewFile[]; selected: number; steps: Step[]; x: number; y: number };
    result: { color: string };
  };
}

export type RequestType = keyof Requests;

export type RequestMessage = {
  [K in RequestType]: { id: number; type: K; appUrl: string; args: Requests[K]['args'] };
}[RequestType];

export type ResponseMessage =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
