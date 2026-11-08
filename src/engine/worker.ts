/// <reference lib="webworker" />
/** The engine worker: decodes, runs the steps and encodes, off the main thread. */

import { inspect, processFile, renderPreview } from './pipeline';
import type { RequestMessage, ResponseMessage } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  try {
    let result: unknown;
    const transfer: Transferable[] = [];
    switch (message.type) {
      case 'inspect':
        result = await inspect(message.args.blob);
        break;
      case 'process':
        result = await processFile(message.args.input, message.args.steps, { scale: 1 });
        break;
      case 'preview': {
        const bitmap = (await renderPreview(message.args)).transferToImageBitmap();
        transfer.push(bitmap);
        result = bitmap;
        break;
      }
    }
    self.postMessage({ id: message.id, ok: true, result } satisfies ResponseMessage, transfer);
  } catch (error) {
    console.error(error);
    const text = error instanceof Error ? error.message : String(error);
    self.postMessage({
      id: message.id,
      ok: false,
      error: text || 'Processing failed.',
    } satisfies ResponseMessage);
  }
};
