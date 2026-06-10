/**
 * Main-thread client for the pixel worker. Heavy per-pixel passes on
 * full-resolution exports run off the UI thread; if workers are unavailable
 * (or the worker crashes) every call falls back to the same pure functions
 * synchronously, so callers never have to care which path ran.
 *
 * Requests are structured-cloned to the worker (the source buffer stays
 * usable for the fallback); responses transfer their buffer back zero-copy.
 */

import { BackgroundKeyOptions, keyBackgroundPixels, sharpenPixels } from './pixel-ops';
import type { PixelWorkerRequest, PixelWorkerResponse } from './pixel.worker';

interface Pending {
  resolve: (buffer: ArrayBuffer) => void;
  reject: (reason: unknown) => void;
}

/** `undefined` = not yet created, `null` = unavailable (keep using fallback). */
let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker !== undefined) {
    return worker;
  }
  if (typeof Worker === 'undefined') {
    worker = null;
    return worker;
  }

  try {
    worker = new Worker(new URL('./pixel.worker', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    return worker;
  }

  worker.addEventListener('message', ({ data }: MessageEvent<PixelWorkerResponse>) => {
    const entry = pending.get(data.id);
    pending.delete(data.id);
    entry?.resolve(data.buffer);
  });
  worker.addEventListener('error', () => {
    for (const entry of pending.values()) {
      entry.reject(new Error('The pixel worker failed.'));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  });

  return worker;
}

function post(request: PixelWorkerRequest): Promise<ArrayBuffer> | null {
  const instance = getWorker();
  if (!instance) {
    return null;
  }
  return new Promise((resolve, reject) => {
    pending.set(request.id, { resolve, reject });
    instance.postMessage(request);
  });
}

/** Sharpen a full-resolution export, preferring the worker. */
export async function sharpenImageData(imageData: ImageData, amount: number): Promise<ImageData> {
  const request = post({
    id: nextId++,
    op: 'sharpen',
    buffer: imageData.data.buffer as ArrayBuffer,
    width: imageData.width,
    height: imageData.height,
    amount,
  });

  if (request) {
    try {
      const buffer = await request;
      return new ImageData(new Uint8ClampedArray(buffer), imageData.width, imageData.height);
    } catch {
      // Worker crashed mid-run — the source buffer was cloned, so fall through.
    }
  }

  return new ImageData(
    sharpenPixels(imageData.data, imageData.width, imageData.height, amount),
    imageData.width,
    imageData.height,
  );
}

/** Key out a background color on a full-resolution export, preferring the worker. */
export async function keyBackgroundImageData(
  imageData: ImageData,
  options: BackgroundKeyOptions,
): Promise<ImageData> {
  const request = post({
    id: nextId++,
    op: 'background-key',
    buffer: imageData.data.buffer as ArrayBuffer,
    key: { color: options.color, tolerance: options.tolerance, edgeSmoothing: options.edgeSmoothing },
  });

  if (request) {
    try {
      const buffer = await request;
      return new ImageData(new Uint8ClampedArray(buffer), imageData.width, imageData.height);
    } catch {
      // Worker crashed mid-run — the source buffer was cloned, so fall through.
    }
  }

  keyBackgroundPixels(imageData.data, options);
  return imageData;
}
