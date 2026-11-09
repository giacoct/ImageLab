import { readFileSync } from "node:fs";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Relative base: the same build works at https://<user>.github.io/ImageLab/
// and at the root of any other static host.
export default defineConfig({
  base: "./",
  plugins: [svelte(), ocrFiles()],
  server: { port: 4200 },
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
