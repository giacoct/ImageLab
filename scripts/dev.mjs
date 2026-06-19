#!/usr/bin/env node
/**
 * One-command local dev environment: starts the FastAPI vectorizer backend
 * (port 4201) and the Angular dev server (which proxies /api to it). On first
 * run it bootstraps the backend virtualenv and installs its dependencies.
 *
 *   npm run dev
 *
 * Ctrl+C stops both processes.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'server');
const isWindows = process.platform === 'win32';
const venvDir = join(serverDir, '.venv');
const venvBin = join(venvDir, isWindows ? 'Scripts' : 'bin');
const venvPython = join(venvBin, isWindows ? 'python.exe' : 'python');

// Replicate what `activate` does, scoped to the spawned backend: put the venv
// first on PATH and mark it active. Launching with the venv's python is not
// enough on Windows — uvicorn's `--reload` supervisor re-spawns the venv's
// *base* interpreter, which here is the flaky Microsoft Store Python alias and
// fails on a cold first run. That is why `npm run dev` previously only worked
// on the second attempt (or after manually activating the venv). With the venv
// on PATH the correct interpreter is found on the first try.
const backendEnv = { ...process.env, VIRTUAL_ENV: venvDir };
// Windows env vars are case-insensitive, so reuse the existing PATH key (often
// `Path`) rather than adding a second one that would be ignored.
const pathKey = Object.keys(backendEnv).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
backendEnv[pathKey] = `${venvBin}${delimiter}${backendEnv[pathKey] ?? ''}`;
// Invoke the Angular CLI's JS entrypoint with node directly. Spawning the
// `npm`/`ng` `.cmd` shim instead throws EINVAL on Windows (Node CVE-2024-27980).
const ngEntrypoint = join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

/** Run a command to completion, inheriting stdio; exit on failure. */
function runStep(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[dev] \`${command} ${args.join(' ')}\` failed (exit ${result.status}).`);
    process.exit(1);
  }
}

// 1. Bootstrap the backend virtualenv on first run.
if (!existsSync(venvPython)) {
  console.log('[dev] Setting up the backend virtualenv (first run)...');
  runStep(isWindows ? 'python' : 'python3', ['-m', 'venv', '.venv'], serverDir);
  runStep(venvPython, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'], serverDir);
  runStep(venvPython, ['-m', 'pip', 'install', '--quiet', '-r', 'requirements.txt'], serverDir);
}

// 2. Start both long-running processes with prefixed, colorized output.
const children = [];
let shuttingDown = false;

function start(label, color, command, args, cwd, env = process.env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m[${label}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (chunk) => out.write(chunk.toString().replace(/^/gm, tag)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`${tag}exited (${code}); shutting down the other process.`);
      shutdown();
    }
  });
  children.push(child);
}

/**
 * Stop a child *and its descendants*. `child.kill()` alone only signals the
 * direct child, so on Windows uvicorn's `--reload` supervisor and worker
 * (grandchildren) would be orphaned and keep holding port 4201 — which is what
 * made the *next* `npm run dev` fail until the stragglers were cleared. Kill the
 * whole tree so Ctrl+C leaves nothing behind.
 */
function killTree(child) {
  if (!child.pid) return;
  try {
    if (isWindows) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  } catch {
    /* already gone */
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    killTree(child);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * Free a TCP port left occupied by a stray process (e.g. an orphan from a
 * previous run that wasn't cleaned up, or a crash). Without this, the server
 * that wants the port fails to bind and the run has to be retried. Best-effort
 * and Windows-specific; nothing to do on a clean machine.
 */
function freePort(port) {
  if (!isWindows) return;
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return;
  const pids = new Set();
  for (const line of result.stdout.split('\n')) {
    // e.g. "  TCP    127.0.0.1:4201   0.0.0.0:0   LISTENING   12345"
    const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/);
    if (match && Number(match[1]) === port) {
      pids.add(match[2]);
    }
  }
  for (const pid of pids) {
    console.log(`[dev] Port ${port} is busy (PID ${pid}); clearing a stale process.`);
    spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
  }
}

freePort(4201);
freePort(4200);

console.log('[dev] Starting backend (:4201) and Angular dev server...');
start(
  'api',
  '36',
  venvPython,
  ['-m', 'uvicorn', 'app:app', '--port', '4201', '--reload'],
  serverDir,
  backendEnv,
);
start('web', '35', process.execPath, [ngEntrypoint, 'serve'], root);
