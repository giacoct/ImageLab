/**
 * Extract text (OCR) with Tesseract. Its worker, WASM engine and language
 * data are served by the app itself (see `ocrFiles` in vite.config.ts) and
 * loaded the first time OCR runs.
 */

import type { Worker as Tesseract } from "tesseract.js";

import { p } from "../core/params";
import { adjustPixels } from "../core/pixels";
import { editPixels, flattened, type Img } from "../engine/canvas";
import { finalOp } from "./op";

let current: { langs: string; worker: Promise<Tesseract> } | undefined;
/** Hears Tesseract's progress while it reads an image. */
let reportProgress: ((fraction: number) => void) | undefined;

/** One Tesseract worker per engine worker, kept warm; recreated when the languages change. */
function tesseract(
  langs: string,
  asset: (path: string) => string,
): Promise<Tesseract> {
  if (current?.langs !== langs) {
    void current?.worker.then((old) => old.terminate()).catch(() => {});
    const worker = import("tesseract.js").then(({ createWorker, OEM }) =>
      createWorker(langs.split("+"), OEM.LSTM_ONLY, {
        workerPath: asset("ocr/worker.min.js"),
        corePath: asset("ocr/tesseract-core-simd-lstm.wasm.js"),
        langPath: asset("ocr"),
        workerBlobURL: false,
        // The browser's HTTP cache keeps the language files already.
        cacheMethod: "none",
        logger: ({ status, progress }) => {
          if (status === "recognizing text") reportProgress?.(progress);
        },
      }),
    );
    current = { langs, worker };
    worker.catch(() => (current = undefined)); // let a later run retry
  }
  return current.worker;
}

/**
 * Tesseract reads dark text on a light background best: flatten onto white,
 * make it grayscale, and invert it when it's mostly dark (light text).
 */
function prepare(image: Img): OffscreenCanvas {
  return editPixels(flattened(image), ({ data }) => {
    const gray = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      grayscale: 100,
      sepia: 0,
    };
    adjustPixels(data, { ...gray, invert: false });
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
    if (sum / (data.length / 4) < 110)
      adjustPixels(data, { ...gray, invert: true });
  });
}

export const ocr = finalOp({
  id: "ocr",
  kind: "final",
  title: "Extract text (OCR)",
  description: "Read the text in the image into a .txt file.",
  suffix: "text",
  heavy: true,
  params: {
    language: p.choice({
      label: "Language",
      default: "eng+ita",
      options: [
        { value: "eng+ita", label: "Both" },
        { value: "eng", label: "English" },
        { value: "ita", label: "Italian" },
      ],
      hint: "Picking the text's language gives a more precise result.",
    }),
    layout: p.choice({
      label: "Layout",
      default: "document",
      options: [
        { value: "document", label: "Document" },
        { value: "sparse", label: "Scattered text" },
      ],
      hint: "Scattered text works better for screenshots, signs and photos.",
    }),
  },
  async run(image, values, context) {
    const worker = await tesseract(values.language, context.asset);
    const { PSM } = await import("tesseract.js");
    await worker.setParameters({
      tessedit_pageseg_mode:
        values.layout === "sparse" ? PSM.SPARSE_TEXT : PSM.AUTO,
    });
    const png = await prepare(image).convertToBlob({ type: "image/png" });
    reportProgress = context.progress;
    const { data } = await worker.recognize(png).finally(() => {
      reportProgress = undefined;
    });
    // Tidy up: no trailing spaces, at most one blank line between paragraphs.
    const text = data.text
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return new Blob([text], { type: "text/plain;charset=utf-8" });
  },
});
