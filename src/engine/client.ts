/**
 * Main-thread access to the engine: a small pool of engine workers for
 * reading and processing files, plus one dedicated worker for live previews.
 * Cancelling a request terminates its worker, which is the only way to stop
 * WASM code mid-run.
 */

import type { RequestType, Requests, RequestMessage, ResponseMessage } from './protocol';

/** Thrown (as the rejection) when a request is cancelled. */
export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'Cancelled';
  }
}

class EngineWorker {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  busy = false;

  call<K extends RequestType>(
    type: K,
    args: Requests[K]['args'],
    signal?: AbortSignal,
  ): Promise<Requests[K]['result']> {
    if (signal?.aborted) return Promise.reject(new Cancelled());
    const worker = this.ensure();
    const id = ++this.nextId;
    return new Promise<Requests[K]['result']>((resolve, reject) => {
      const onAbort = () => {
        this.restart();
        reject(new Cancelled());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(value as Requests[K]['result']);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      });
      worker.postMessage({ id, type, args } as RequestMessage);
    });
  }

  /** Kill the worker (and whatever it was running); a new one starts on the next call. */
  restart(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const { reject } of this.pending.values()) reject(new Cancelled());
    this.pending.clear();
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ResponseMessage>) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) return;
      this.pending.delete(response.id);
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new Error(response.error));
    };
    worker.onerror = (event) => {
      // A crash (e.g. out of memory) fails everything in flight on this worker.
      event.preventDefault();
      const error = new Error(event.message || 'The image engine crashed (out of memory?).');
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }
}

/** Up to 4 workers, leaving a core for the UI. */
const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

class Engine {
  private readonly pool = Array.from({ length: POOL_SIZE }, () => new EngineWorker());
  private waiting: (() => void)[] = [];
  private readonly previewWorker = new EngineWorker();

  /** Run a request on the first idle pool worker, waiting for one if they're all busy. */
  async run<K extends RequestType>(
    type: K,
    args: Requests[K]['args'],
    signal?: AbortSignal,
  ): Promise<Requests[K]['result']> {
    for (;;) {
      if (signal?.aborted) throw new Cancelled();
      const worker = this.pool.find((candidate) => !candidate.busy);
      if (worker) {
        worker.busy = true;
        try {
          return await worker.call(type, args, signal);
        } finally {
          worker.busy = false;
          // Wake every waiter: each checks again, so a cancelled one can't
          // swallow the wake-up another needs.
          for (const wake of this.waiting.splice(0)) wake();
        }
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
  }

  /** Run on the preview worker, so previews never wait behind a batch. */
  preview(args: Requests['preview']['args']): Promise<ImageBitmap> {
    return this.previewWorker.call('preview', args);
  }
}

export const engine = new Engine();
