import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Relative base: the same build works at https://<user>.github.io/ImageLab/
// and at the root of any other static host.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: { port: 4200 },
  worker: { format: 'es' },
  // libheif embeds its WASM in one 2 MB chunk, loaded only for HEIC files.
  build: { target: 'es2023', chunkSizeWarningLimit: 2500 },
  optimizeDeps: {
    // These ship WASM that they locate via `import.meta.url`; pre-bundling
    // would move the JS away from its .wasm files.
    exclude: ['@jsquash/jpeg', '@jsquash/webp', '@jsquash/avif'],
    // Imported only from the worker, which Vite doesn't scan: prepare it up
    // front so the dev server doesn't reload the page the first time it loads.
    include: ['libheif-js/libheif-wasm/libheif-bundle.mjs'],
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
