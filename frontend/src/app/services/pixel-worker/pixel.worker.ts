/// <reference lib="webworker" />

import { BackgroundKeyOptions, keyBackgroundPixels, sharpenPixels } from '../../domain/pixel-ops';

/** One job for the worker; it replies with the resulting RGBA buffer. */
export type PixelWorkerRequest =
  | { op: 'sharpen'; buffer: ArrayBuffer; width: number; height: number; amount: number }
  | { op: 'background-key'; buffer: ArrayBuffer; key: BackgroundKeyOptions };

addEventListener('message', ({ data }: MessageEvent<PixelWorkerRequest>) => {
  const pixels = new Uint8ClampedArray(data.buffer);

  let result: Uint8ClampedArray<ArrayBuffer>;
  if (data.op === 'sharpen') {
    result = sharpenPixels(pixels, data.width, data.height, data.amount);
  } else {
    keyBackgroundPixels(pixels, data.key);
    result = pixels;
  }

  postMessage(result.buffer, { transfer: [result.buffer] });
});
