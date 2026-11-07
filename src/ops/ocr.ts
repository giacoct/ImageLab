import type { Worker as TesseractWorker } from 'tesseract.js';

import { buildOcrPage, OCR_LANGUAGES, type RawWord } from '../core/ocr';
import { p } from '../core/params';
import { adjustPixels } from '../core/pixels';
import { createCanvas, context2d, editPixels, type Img } from '../engine/canvas';
import { textOp } from './op';

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });
const iso639_1: Record<string, string> = { eng: 'en', ita: 'it' };
const languageOptions = OCR_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_NAMES.of(iso639_1[code]) ?? code,
}));

let worker: { langs: string; worker: Promise<TesseractWorker> } | undefined;

/** One Tesseract worker per engine worker, recreated when the languages change. */
async function loadWorker(
  langs: string,
  asset: (path: string) => string,
): Promise<TesseractWorker> {
  if (worker?.langs !== langs) {
    void worker?.worker.then((old) => old.terminate()).catch(() => {});
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const created = createWorker(langs.split('+'), OEM.LSTM_ONLY, {
      workerPath: asset('vendor/tesseract/worker.min.js'),
      corePath: asset('vendor/tesseract/'),
      langPath: asset('vendor/tessdata'),
      workerBlobURL: false,
      // The browser/service worker caches the language files already.
      cacheMethod: 'none',
    }).then(async (w) => {
      // Sparse text: finds text anywhere, regardless of layout — better for
      // screenshots, slides and photos than the default page segmentation.
      await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return w;
    });
    worker = { langs, worker: created };
    created.catch(() => (worker = undefined));
  }
  return worker.worker;
}

/** A grayscale PNG of the image, optionally inverted. */
async function grayPng(image: Img, invert: boolean): Promise<Blob> {
  const copy = createCanvas(image.width, image.height);
  const ctx = context2d(copy);
  ctx.fillStyle = '#ffffff'; // transparent areas read as paper, not black
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(image, 0, 0);
  editPixels(copy, (pixels) =>
    adjustPixels(pixels.data, {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      grayscale: 100,
      sepia: 0,
      invert,
    }),
  );
  return copy.convertToBlob({ type: 'image/png' });
}

export const ocr = textOp({
  id: 'ocr',
  kind: 'text',
  title: 'Extract text (OCR)',
  description: 'Recognize the text in the image (Tesseract).',
  icon: 'ocr',
  suffix: 'text',
  heavy: true,
  params: {
    language: p.choice({ label: 'Language', default: 'eng', options: languageOptions }),
    second: p.choice({
      label: 'Also recognize',
      default: 'none',
      options: [{ value: 'none', label: 'Nothing else' }, ...languageOptions],
    }),
  },
  async run(image, values, context) {
    const langs =
      values.second !== 'none' && values.second !== values.language
        ? `${values.language}+${values.second}`
        : values.language;
    const tesseract = await loadWorker(langs, context.asset);

    // Two passes: dark-on-light text, then the inverted image for light text
    // on dark backgrounds. Overlapping detections are merged afterwards.
    const passes: RawWord[][] = [];
    for (const invert of [false, true]) {
      const { data } = await tesseract.recognize(
        await grayPng(image, invert),
        {},
        { blocks: true },
      );
      passes.push(
        (data.blocks ?? []).flatMap((block) =>
          block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
        ),
      );
    }
    return buildOcrPage(passes, image.width, image.height);
  },
});
