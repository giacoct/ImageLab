#!/usr/bin/env node
/**
 * Prepare (or update) a checkout so it can run: `npm run setup`.
 *
 *   1. frontend dependencies (`npm ci`)            — when package-lock.json changed
 *   2. backend virtualenv + pip requirements        — when requirements.txt changed
 *   3. the upscaler model weights (sha256-checked)  — when missing
 *   4. a check that Tesseract and its language packs are installed (warning only)
 *
 * Safe to re-run: every step is skipped when already up to date, so the update
 * flow is simply `git pull && npm run setup && npm run build`. `npm run dev`
 * runs this automatically.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = join(root, 'frontend');
const backendDir = join(root, 'backend');
export const venvPython = join(backendDir, '.venv', 'bin', 'python');

// Published as an asset of the repo's `models-v1` GitHub release (kept out of git).
const MODEL_URL =
  'https://github.com/giacoct/ImageLab/releases/download/models-v1/realesr-general-x4v3.onnx';
const MODEL_SHA256 = '4f5a9ef782d8f5b8a9b431234d813bf837a6dfa790baa59b13a7a769ba944534';
const modelPath = join(backendDir, 'models', 'realesr-general-x4v3.onnx');

// Must match OCR_LANGUAGES in frontend/src/app/tools/ocr/ocr.ts.
const OCR_LANGS = ['eng', 'ita'];

export async function setup() {
  installFrontend();
  installBackend();
  await downloadModel();
  checkTesseract();
}

function installFrontend() {
  const stamp = join(frontendDir, 'node_modules', '.imagelab-lock-hash');
  const hash = hashFile(join(frontendDir, 'package-lock.json'));
  if (readStamp(stamp) === hash) return;

  log('Installing frontend dependencies...');
  run('npm', ['ci'], frontendDir);
  writeFileSync(stamp, hash);
}

function installBackend() {
  const stamp = join(backendDir, '.venv', '.imagelab-requirements-hash');
  const hash = hashFile(join(backendDir, 'requirements.txt'));
  if (existsSync(venvPython) && readStamp(stamp) === hash) return;

  if (!existsSync(venvPython)) {
    const python = findPython();
    log(`Creating the backend virtualenv with ${python}...`);
    run(python, ['-m', 'venv', '.venv'], backendDir);
  }
  log('Installing backend requirements...');
  run(venvPython, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'], backendDir);
  run(venvPython, ['-m', 'pip', 'install', '--quiet', '-r', 'requirements.txt'], backendDir);
  writeFileSync(stamp, hash);
}

/**
 * The newest Python on PATH between 3.10 and 3.13. Older ones lack wheels for
 * our dependencies (macOS's /usr/bin/python3 is 3.9); on 3.14 the vtracer
 * wheel segfaults, which would take the whole server down on "Convert to SVG".
 */
function findPython() {
  const candidates = ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'];
  const supported = 'import sys; sys.exit(not (3, 10) <= sys.version_info < (3, 14))';
  for (const command of candidates) {
    if (spawnSync(command, ['-c', supported]).status === 0) return command;
  }
  fail('Python 3.10–3.13 is required (e.g. `brew install python@3.13` or `apt install python3`).');
}

async function downloadModel() {
  if (existsSync(modelPath)) return;

  log('Downloading the upscaler model (~5 MB)...');
  try {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== MODEL_SHA256) throw new Error(`checksum mismatch (got ${sha256})`);

    mkdirSync(dirname(modelPath), { recursive: true });
    writeFileSync(`${modelPath}.part`, bytes);
    renameSync(`${modelPath}.part`, modelPath);
  } catch (error) {
    // Not fatal: every tool except "Upscale image" works without it.
    warn(
      `Could not download the upscaler model (${error.message}). Re-run \`npm run setup\` later.`,
    );
  }
}

function checkTesseract() {
  const result = spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    warn('Tesseract is not installed, so "Extract text (OCR)" will fail. See docs/api.md.');
    return;
  }
  const installed = new Set(result.stdout.split('\n').map((line) => line.trim()));
  const missing = OCR_LANGS.filter((lang) => !installed.has(lang));
  if (missing.length > 0) {
    warn(`Tesseract language packs missing: ${missing.join(', ')}. See docs/api.md.`);
  }
}

// --- helpers -----------------------------------------------------------------

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    fail(
      `\`${command} ${args.join(' ')}\` failed (exit ${result.status ?? result.error?.message}).`,
    );
  }
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readStamp(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function log(message) {
  console.log(`[setup] ${message}`);
}

function warn(message) {
  console.warn(`\x1b[33m[setup] Warning: ${message}\x1b[0m`);
}

function fail(message) {
  console.error(`\x1b[31m[setup] ${message}\x1b[0m`);
  process.exit(1);
}

// Run when invoked directly (`npm run setup`), not when imported by dev.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await setup();
  log('Done.');
}
