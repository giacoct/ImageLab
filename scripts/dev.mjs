#!/usr/bin/env node
/**
 * One-command local dev environment: `npm run dev`.
 *
 * Runs `setup` (a no-op when everything is installed), then starts the FastAPI
 * backend on :4201 (auto-reloads on change) and the Angular dev server on :4200
 * (which proxies /api to the backend, see frontend/proxy.conf.json). Output is
 * prefixed per process; Ctrl+C or either process exiting stops both.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setup, venvPython } from './setup.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await setup();

const children = [];
let shuttingDown = false;

/** Start a long-running process whose output lines are prefixed with a colored tag. */
function start(label, color, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m[${label}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (chunk) => out.write(chunk.toString().replace(/^(?=.)/gm, tag)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`${tag}exited (${code}); stopping the other process.`);
      shutdown();
    }
  });
  children.push(child);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[dev] Starting backend (:4201) and Angular dev server (:4200)...');
start(
  'api',
  '36',
  venvPython,
  ['-m', 'uvicorn', 'main:app', '--port', '4201', '--reload'],
  join(root, 'backend'),
);
start(
  'web',
  '35',
  process.execPath,
  [join('node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'serve'],
  join(root, 'frontend'),
);
