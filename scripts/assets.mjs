#!/usr/bin/env node
/**
 * Prepare the static files the app loads at runtime but that don't belong in
 * git (`npm run assets`; dev, build and test run it first):
 *
 *   public/vendor/  copied from node_modules, so their versions follow
 *                   package-lock.json: the Tesseract worker + WASM cores and
 *                   the OCR language data (tesseract.js loads them by URL;
 *                   the other WASM modules are bundled by Vite).
 *   public/models/  the Real-ESRGAN upscaler weights, downloaded from the
 *                   repo's `models-v1` GitHub release and pinned by sha256.
 *
 * Everything is served from the app's own origin, so nothing is fetched from
 * a CDN at runtime and the service worker can cache it for offline use.
 * Safe to re-run: files already up to date are skipped.
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const publicDir = join(root, 'public');

/** OCR languages shipped with the app (also listed in src/core/ocr.ts). */
const OCR_LANGUAGES = ['eng', 'ita'];

/** [source in node_modules, destination in public/]. */
const COPIES = [
  ['tesseract.js/dist/worker.min.js', 'vendor/tesseract/worker.min.js'],
  // Only the LSTM-only cores: the app always runs Tesseract with OEM 1 (LSTM),
  // and tesseract.js picks the variant matching the browser's SIMD support.
  ...['', '-simd', '-relaxedsimd'].map((variant) => [
    `tesseract.js-core/tesseract-core${variant}-lstm.wasm.js`,
    `vendor/tesseract/tesseract-core${variant}-lstm.wasm.js`,
  ]),
  ...OCR_LANGUAGES.map((lang) => [
    `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `vendor/tessdata/${lang}.traineddata.gz`,
  ]),
];

const MODEL = {
  url: 'https://github.com/giacoct/ImageLab/releases/download/models-v1/realesr-general-x4v3.onnx',
  sha256: '4f5a9ef782d8f5b8a9b431234d813bf837a6dfa790baa59b13a7a769ba944534',
  path: join(publicDir, 'models', 'realesr-general-x4v3.onnx'),
};

function copyAll() {
  for (const [from, to] of COPIES) {
    const source = join(modules, from);
    const target = join(publicDir, to);
    if (!existsSync(source)) fail(`Missing ${from}. Run \`npm ci\` first.`);
    if (existsSync(target) && sameFile(source, target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    log(`copied ${to}`);
  }
}

function sameFile(a, b) {
  const [sa, sb] = [statSync(a), statSync(b)];
  return sa.size === sb.size && sa.mtimeMs <= sb.mtimeMs;
}

async function downloadModel() {
  if (existsSync(MODEL.path) && sha256(readFileSync(MODEL.path)) === MODEL.sha256) return;

  log('downloading the upscaler model (~5 MB)...');
  const response = await fetch(MODEL.url);
  if (!response.ok) fail(`Could not download the upscaler model: HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== MODEL.sha256) fail(`Upscaler model checksum mismatch (got ${actual}).`);

  mkdirSync(dirname(MODEL.path), { recursive: true });
  writeFileSync(`${MODEL.path}.part`, bytes);
  renameSync(`${MODEL.path}.part`, MODEL.path);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function log(message) {
  console.log(`[assets] ${message}`);
}

function fail(message) {
  console.error(`\x1b[31m[assets] ${message}\x1b[0m`);
  process.exit(1);
}

copyAll();
await downloadModel();
