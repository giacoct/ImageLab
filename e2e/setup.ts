/**
 * Before the end-to-end tests: build the site into a temporary folder and
 * serve it as GitHub Pages does, with plain static files and none of the
 * headers the dev server adds (the service worker has to). The tests get
 * its address with `inject("baseUrl")`.
 */

import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

import { build } from "vite";
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
  const outDir = await mkdtemp(join(tmpdir(), "imagelab-e2e-"));
  // A production build, as deployed (Vitest sets NODE_ENV to "test").
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({
      mode: "production",
      logLevel: "error",
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    process.env.NODE_ENV = nodeEnv;
  }

  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const file = normalize(
      join(outDir, path.endsWith("/") ? `${path}index.html` : path),
    );
    try {
      if (!file.startsWith(outDir)) throw new Error("outside");
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  project.provide("baseUrl", `http://localhost:${address.port}/`);

  return async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(outDir, { recursive: true, force: true });
  };
}
