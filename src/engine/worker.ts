/// <reference lib="webworker" />
/** The engine worker: decodes, applies tools and encodes, off the main thread. */

import {
  apply,
  backgroundOf,
  finish,
  open,
  renderDetail,
  renderPreview,
  save,
} from "./pipeline";
import type { RequestMessage, ResponseMessage } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  const asset = (path: string) => new URL(path, message.appUrl).href;
  const context = {
    scale: 1,
    asset,
    progress: (progress: number) =>
      self.postMessage({ id: message.id, progress } satisfies ResponseMessage),
  };
  try {
    let result: unknown;
    const transfer: Transferable[] = [];
    switch (message.type) {
      case "open":
        result = await open(message.args.blob, message.args.name);
        break;
      case "apply":
        result = await apply(message.args.inputs, message.args.action, context);
        break;
      case "finish":
        result = await finish(message.args.input, message.args.action, context);
        break;
      case "save":
        result = await save(message.args.version);
        break;
      case "background":
        result = await backgroundOf(message.args.version);
        break;
      case "preview": {
        const { image, scale } = await renderPreview(message.args, asset);
        const bitmap = image.transferToImageBitmap();
        transfer.push(bitmap);
        result = { bitmap, scale };
        break;
      }
      case "detail": {
        const { image, region, density } = await renderDetail(
          message.args,
          asset,
        );
        const bitmap = image.transferToImageBitmap();
        transfer.push(bitmap);
        result = { bitmap, region, density };
        break;
      }
    }
    self.postMessage(
      { id: message.id, ok: true, result } satisfies ResponseMessage,
      transfer,
    );
  } catch (error) {
    console.error(error);
    const text = error instanceof Error ? error.message : String(error);
    self.postMessage({
      id: message.id,
      ok: false,
      error: text || "Processing failed.",
    } satisfies ResponseMessage);
  }
};
