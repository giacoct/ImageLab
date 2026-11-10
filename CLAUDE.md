# ImageLab

Image tools whose results can be downloaded or used as the input of another tool, running entirely in the browser: a static Svelte 5 + TypeScript site on GitHub Pages, no backend. What it does is in `README.md`; how it's built is below and in each module's header comment.

## Commands

```bash
npm run dev       # http://localhost:4200
npm run check     # prettier --check, svelte-check, all tests: run after every change
npm run build     # svelte-check + vite build → dist/
npx vitest run --project unit      # pure tests (src/core), Node, fast
npx vitest run --project browser   # engine tests (src/engine), headless Chromium
npm run format    # prettier --write .
```

## Layout

`src/`, each layer importing only from the ones above it (the engine's pipeline also runs the ops):

- `core/`: pure logic (geometry, pixels, params, metadata, EXIF and color profiles, ZIP…), no DOM; unit-tested in Node.
- `engine/`: decoding, encoding and canvas primitives, the worker pipeline (`pipeline.ts`, `worker.ts`), its main-thread client (`client.ts`) and the GPU live preview (`live.ts`); browser-tested.
- `ops/`: one file per tool, each an `Op` (`op.ts`) with a settings schema and a `run`; `index.ts` lists them in display order. `models/` holds the upscaler's ONNX model (patched, see `upscale.ts`).
- `app/`: app state (`session.svelte.ts`), routing (`#/<tool id>`), previews, file picking, downloads, the share sheet (`share.ts`) and the service worker (`service.ts`; `public/service-worker.js` keeps the build's files for offline use, listed by `vite.config.ts`, isolates the app for threads and receives shares).
- `ui/`: Svelte components; `tools.ts` gives each tool its icon and color, `icons.ts` maps the icon names settings use (`ChoiceOption.icon`) to components.

Adding a tool: a file in `src/ops/`, its entry in `ops/index.ts` and `ui/tools.ts`, a line in `README.md`.

## Rules

- Always commit, push when told to. "Commit" means: `npm run check` passes commit. "Push" means `git push origin main`, then watch the deploy (`gh run watch`).
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `ci:`, ...), one per coherent change.
- Feature-oriented: tools are the core of ImageLab, prefer a simple and clean design that is reliable, efficient and pleasant to use.
- Check UI changes in a real browser, not only with tests.
- Keep `README.md` and `CLAUDE.md` in step with the code, in the same commit.
