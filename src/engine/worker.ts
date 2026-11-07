/// <reference lib="webworker" />
/**
 * The engine worker: decodes, runs operations and encodes, off the main
 * thread. Workers are long-lived, so loaded models (upscaler, OCR) stay warm
 * between files.
 */

import { context2d } from './canvas';
import { inspect, processJob, renderPreview } from './pipeline';
import type { RequestMessage, ResponseMessage } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  const asset = (path: string) => new URL(path, message.appUrl).href;
  try {
    let result: unknown;
    const transfer: Transferable[] = [];
    switch (message.type) {
      case 'inspect':
        result = await inspect(message.args.blob);
        break;
      case 'process':
        result = await processJob(message.args.inputs, message.args.recipe, { scale: 1, asset });
        break;
      case 'preview': {
        const { files, selected, steps, maxSide } = message.args;
        const image = await renderPreview(files, selected, steps, maxSide, asset);
        const bitmap = image.transferToImageBitmap();
        transfer.push(bitmap);
        result = { bitmap };
        break;
      }
      case 'sample': {
        const { files, selected, steps, x, y } = message.args;
        const image = await renderPreview(files, selected, steps, 1024, asset);
        const px = Math.min(image.width - 1, Math.max(0, Math.floor(x * image.width)));
        const py = Math.min(image.height - 1, Math.max(0, Math.floor(y * image.height)));
        const [r, g, b] = context2d(image).getImageData(px, py, 1, 1).data;
        result = { color: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}` };
        break;
      }
    }
    self.postMessage({ id: message.id, ok: true, result } satisfies ResponseMessage, transfer);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.error(error);
    self.postMessage({
      id: message.id,
      ok: false,
      error: text || 'Processing failed.',
    } satisfies ResponseMessage);
  }
};
