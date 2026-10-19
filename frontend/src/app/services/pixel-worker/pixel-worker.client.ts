/**
 * Main-thread client for the pixel worker. Heavy per-pixel passes on
 * full-resolution exports run off the UI thread, each in a worker started for
 * that job (so a failure can't affect other jobs); if the worker can't run,
 * the same pure function runs inline instead, so callers never have to care
 * which path ran.
 *
 * The pixels are copied to the worker (the source stays intact for the
 * fallback) and the result is transferred back without a copy.
 */

import { BackgroundKeyOptions, keyBackgroundPixels, sharpenPixels } from '../../domain/pixel-ops';
import type { PixelWorkerRequest } from './pixel.worker';

/** Sharpen a full-resolution export; `amount` is 0..1. */
export async function sharpenImageData(imageData: ImageData, amount: number): Promise<ImageData> {
  const { data, width, height } = imageData;
  const pixels = await inWorker({ op: 'sharpen', buffer: data.buffer, width, height, amount }, () =>
    sharpenPixels(data, width, height, amount),
  );
  return new ImageData(pixels, width, height);
}

/** Key out a background color on a full-resolution export. */
export async function keyBackgroundImageData(
  imageData: ImageData,
  key: BackgroundKeyOptions,
): Promise<ImageData> {
  const { data, width, height } = imageData;
  const pixels = await inWorker({ op: 'background-key', buffer: data.buffer, key }, () => {
    keyBackgroundPixels(data, key);
    return data;
  });
  return new ImageData(pixels, width, height);
}

/** Run `request` in a new pixel worker, or `inline` if the worker fails or is unavailable. */
async function inWorker(
  request: PixelWorkerRequest,
  inline: () => Uint8ClampedArray<ArrayBuffer>,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  try {
    return new Uint8ClampedArray(await runWorker(request));
  } catch {
    return inline();
  }
}

function runWorker(request: PixelWorkerRequest): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pixel.worker', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      worker.terminate();
      resolve(data);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('The pixel worker failed.'));
    };
    worker.postMessage(request);
  });
}
