import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import type { Plugin, Rolldown } from 'vite';
import { defineConfig } from 'vitest/config';

// Relative base: the same build works at https://<user>.github.io/ImageLab/
// and at the root of any other static host.
export default defineConfig({
  base: './',
  plugins: [svelte(), serviceWorker()],
  server: { port: 4200 },
  worker: { format: 'es' },
  build: { target: 'es2023', chunkSizeWarningLimit: 1024 },
  // These ship WASM that they locate via `import.meta.url`; pre-bundling
  // would move the JS away from its .wasm files.
  optimizeDeps: {
    exclude: ['@jsquash/jpeg', '@jsquash/webp', '@jsquash/avif', 'onnxruntime-web', 'vtracer-wasm'],
    // Imported only from the worker, which Vite doesn't scan: prepare them up
    // front so the dev server doesn't reload the page the first time they load.
    include: ['libheif-js/libheif-wasm/libheif-bundle.mjs', 'tesseract.js'],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/core/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/engine/**/*.test.ts'],
          testTimeout: 120_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});

/**
 * Emit the service worker (`src/sw.js`) with `__BUILD__` replaced by every
 * file of the build (public ones included) with a hash of its content, and
 * the app shell to cache on install. See sw.js for how it uses them.
 */
function serviceWorker(): Plugin {
  const hash = (content: string | Uint8Array) =>
    createHash('sha256').update(content).digest('hex').slice(0, 12);
  let publicDir = '';

  return {
    name: 'imagelab:service-worker',
    apply: 'build',
    enforce: 'post', // after Vite has added index.html to the bundle
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const files: Record<string, string> = {};
      for (const [name, output] of Object.entries(bundle)) {
        files[name] = hash(output.type === 'chunk' ? output.code : output.source);
      }
      for (const entry of readdirSync(publicDir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue; // e.g. .DS_Store
        const path = join(entry.parentPath, entry.name);
        files[relative(publicDir, path).replaceAll('\\', '/')] = hash(readFileSync(path));
      }

      // The shell: what the app needs to start (the page, the entry script
      // with its CSS, fonts and engine worker, and the icons and manifest at
      // the root). The WASM engines are cached when first used.
      const entry = Object.values(bundle).find(
        (output): output is Rolldown.OutputChunk => output.type === 'chunk' && output.isEntry,
      );
      if (!entry?.viteMetadata) throw new Error('service worker: no entry chunk in the build');
      const shell = new Set([
        ...Object.keys(files).filter((path) => !path.includes('/')),
        entry.fileName,
        ...entry.imports,
        ...entry.viteMetadata.importedCss,
        ...[...entry.viteMetadata.importedAssets].filter((path) => !path.endsWith('.wasm')),
      ]);

      const placeholder = 'const BUILD = __BUILD__;';
      const template = readFileSync('src/sw.js', 'utf8');
      if (!template.includes(placeholder)) throw new Error(`service worker: no "${placeholder}"`);
      const build = JSON.stringify({ files, shell: [...shell] });
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace(placeholder, `const BUILD = ${build};`),
      });
    },
  };
}
