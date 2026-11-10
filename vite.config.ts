import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// Relative base: the same build works at https://<user>.github.io/ImageLab/
// and at the root of any other static host.
export default defineConfig({
  base: "./",
  plugins: [svelte(), ocrFiles(), offlineFiles()],
  // Cross-origin isolation, for threads; on GitHub Pages the service worker
  // adds these headers (public/service-worker.js).
  server: { port: 4200, headers: ISOLATION },
  preview: { headers: ISOLATION },
  worker: { format: "es" },
  // libheif embeds its WASM in one 2 MB chunk, loaded only for HEIC files.
  build: { target: "es2023", chunkSizeWarningLimit: 2500 },
  optimizeDeps: {
    // These ship WASM that they locate via `import.meta.url`; pre-bundling
    // would move the JS away from its .wasm files.
    exclude: [
      "@jsquash/jpeg",
      "@jsquash/webp",
      "@jsquash/avif",
      "vtracer-wasm",
      "onnxruntime-web",
    ],
    // Imported only from the worker, which Vite doesn't scan: prepare them up
    // front so the dev server doesn't reload the page the first time they load.
    include: ["libheif-js/libheif-wasm/libheif-bundle.mjs", "tesseract.js"],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/core/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/engine/**/*.test.ts"],
          testTimeout: 120_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});

/**
 * Tesseract's files for OCR, served under `ocr/` straight from node_modules
 * (so their versions follow package-lock.json): its worker, its WASM engine
 * (the SIMD build, which every current browser runs) and the language data.
 * tesseract.js loads them by URL, the languages from one folder, so they
 * can't take Vite's hashed asset names.
 */
const OCR_FILES: Record<string, string> = {
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "tesseract-core-simd-lstm.wasm.js":
    "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "eng.traineddata.gz":
    "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  "ita.traineddata.gz":
    "@tesseract.js-data/ita/4.0.0_best_int/ita.traineddata.gz",
};

function ocrFiles(): Plugin {
  const read = (name: string) =>
    readFileSync(`node_modules/${OCR_FILES[name]}`);
  return {
    name: "imagelab:ocr-files",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.match(/\/ocr\/([^/?]+)/)?.[1];
        if (!name || !(name in OCR_FILES)) return next();
        // A JavaScript type, or the worker refuses importScripts(); the .gz
        // files as plain bytes, so nothing decompresses them on the way.
        const type = name.endsWith(".js")
          ? "text/javascript"
          : "application/octet-stream";
        response.setHeader("Content-Type", type);
        response.end(read(name));
      });
    },
    generateBundle() {
      for (const name of Object.keys(OCR_FILES)) {
        this.emitFile({
          type: "asset",
          fileName: `ocr/${name}`,
          source: read(name),
        });
      }
    },
  };
}

/**
 * The build's files, written into the service worker (`FILES`), which keeps
 * them for offline use: each with a hash of its content, so it knows which
 * changed, and its size, as it keeps the small ones up front.
 */
function offlineFiles(): Plugin {
  let outDir = "dist";
  return {
    name: "imagelab:offline-files",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const worker = join(outDir, "service-worker.js");
      const files = readdirSync(outDir, {
        recursive: true,
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .filter((path) => path !== worker)
        .map((path) => {
          const bytes = readFileSync(path);
          const hash = createHash("sha256").update(bytes).digest("hex");
          const name = relative(outDir, path).split("\\").join("/");
          return [name, hash.slice(0, 16), bytes.length];
        })
        .sort(([a], [b]) => String(a).localeCompare(String(b)));
      const placeholder = "/* filled in by the build */ [];";
      const source = readFileSync(worker, "utf8");
      if (!source.includes(placeholder))
        throw new Error("service-worker.js: no FILES to fill in");
      writeFileSync(
        worker,
        source.replace(placeholder, `${JSON.stringify(files)};`),
      );
    },
  };
}
