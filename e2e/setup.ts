/**
 * Before the end-to-end tests: build the site into a temporary folder and
 * serve it as GitHub Pages does, with plain static files and none of the
 * headers the dev server adds (the service worker has to). The tests get
 * its address with `inject("baseUrl")`.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { promisify } from "node:util";

import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".gz": "application/gzip",
};

export default async function setup(project: TestProject) {
  const root = project.config.root;
  const outDir = await mkdtemp(join(tmpdir(), "imagelab-e2e-"));
  const cleanUp = () => rm(outDir, { recursive: true, force: true });
  let server: Server;
  try {
    await buildInto(root, outDir);
    server = await serve(outDir);
  } catch (error) {
    await cleanUp();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  project.provide("baseUrl", `http://localhost:${address.port}/`);

  return async () => {
    await new Promise((resolve) => server.close(resolve));
    await cleanUp();
  };
}

/**
 * A production build, as deployed: in a process of its own, run from the
 * project's root, so it finds its config and the files it copies wherever
 * Vitest was started, and its NODE_ENV (Vitest sets "test") stays its own.
 */
async function buildInto(root: string, outDir: string): Promise<void> {
  const vite = join(root, "node_modules", "vite", "bin", "vite.js");
  await promisify(execFile)(
    process.execPath,
    [vite, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
}

/** Static files, as GitHub Pages serves them: paths decoded, folders to their index.html. */
async function serve(outDir: string): Promise<Server> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = decodeURIComponent(url.pathname);
      const file = normalize(
        join(outDir, path.endsWith("/") ? `${path}index.html` : path),
      );
      if (!file.startsWith(outDir + sep)) throw new Error("Outside the site");
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "localhost", resolve);
  });
  return server;
}
