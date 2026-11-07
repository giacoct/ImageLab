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
  build: { target: 'es2023', chunkSizeWarningLimit: 1024 },
  // These ship WASM that they locate via `import.meta.url`; pre-bundling
  // would move the JS away from its .wasm files.
  optimizeDeps: {
    exclude: ['@jsquash/jpeg', '@jsquash/webp', '@jsquash/avif', 'onnxruntime-web', 'vtracer-wasm'],
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
