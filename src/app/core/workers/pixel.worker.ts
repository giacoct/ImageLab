/// <reference lib="webworker" />

import { BackgroundKeyOptions, keyBackgroundPixels, sharpenPixels } from './pixel-ops';

export type PixelWorkerRequest =
  | {
      id: number;
      op: 'sharpen';
      buffer: ArrayBuffer;
      width: number;
      height: number;
      amount: number;
    }
  | { id: number; op: 'background-key'; buffer: ArrayBuffer; key: BackgroundKeyOptions };

export interface PixelWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

addEventListener('message', ({ data }: MessageEvent<PixelWorkerRequest>) => {
  const pixels = new Uint8ClampedArray(data.buffer);

  let result: Uint8ClampedArray;
  if (data.op === 'sharpen') {
    result = sharpenPixels(pixels, data.width, data.height, data.amount);
  } else {
    keyBackgroundPixels(pixels, data.key);
    result = pixels;
  }

  const response: PixelWorkerResponse = { id: data.id, buffer: result.buffer as ArrayBuffer };
  postMessage(response, { transfer: [response.buffer] });
});
