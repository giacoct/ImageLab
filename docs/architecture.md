# ImageLab: how it's built

## The core

ImageLab is a set of image tools that can be chained without limit:

- **A tool is a step.** Each tool is one operation (`src/ops/`), and "Add a
  step" lists them all (`OPS` in `src/ops/index.ts`).
- **A chain is a list of steps** (`Step` in `src/ops/op.ts`). Any tool can
  follow any other, any number of times, and the chain runs on every image
  loaded.

It's a personal project: a static site with no backend, hosted on GitHub
Pages. Keep every solution simple and proportionate.

## Layers

Imports only point downward:

```
src/ui/      Svelte components: one page
src/app/     state (Svelte runes): the session, preview requests, downloads
src/engine/  Web Workers: decode, run the chain, encode
src/ops/     the tools: settings schema + run
src/core/    pure TypeScript (no DOM), unit-tested in Node
```

## Operations

An operation declares its settings once with the builders in
`src/core/params.ts`; the schema gives the defaults and generates the settings
form in the UI. There are two kinds (`src/ops/op.ts`):

- `map` changes the pixels: one `OffscreenCanvas` in, one out;
- `file` changes how the image is saved (Convert format, Compress).

Each image travels through the chain as a `Picture` (`src/engine/encode.ts`):
its pixels, how it will be saved (`Encoding`, `src/core/encoding.ts`, which
starts as the input's format), and the file holding exactly those pixels, if
there is one. A `file` step writes the file right away and continues with its
decoded pixels, so later steps and the preview see the real result, compression
included. The output is that file, unless a later step changed the pixels; then
the image is encoded once at the end.

To add a tool: create `src/ops/<id>.ts`, add it to `OPS`, and add an engine
test. Put any pure math in `src/core/` with a unit test. In `run`:

- multiply any setting given in pixels by `context.scale`, because the live
  preview runs the same code on a downscaled copy;
- throw an `Error` with a message for the user when the input is unusable.

## Engine

`src/engine/client.ts` keeps a pool of workers for reading and processing
files, plus one for previews, so previews never wait behind a batch.
Cancelling terminates the worker, the only way to stop WASM mid-run.
`src/engine/pipeline.ts` runs a chain on one file, and renders previews from a
cached copy of each image downscaled to 1600 px at most. Decoding uses the
browser, and libheif (WASM) for HEIC; JPEG, WebP and AVIF are encoded with the
Squoosh codecs (WASM), PNG by the browser.

## UI

One page, barebone and functional: the images, the steps and the run button on
the left; the preview and results on the right. Native controls, the system
font, text instead of icons, no animations, a small `src/styles.css`. Colors
follow the system light/dark scheme. Images can be dropped or pasted anywhere.

## Things that are easy to break

- **WASM modules are bundled by Vite** and must stay in
  `optimizeDeps.exclude` in `vite.config.ts`.
- **The base path is relative** (`base: './'`), so the site works under
  `/ImageLab/`: use relative URLs.
- **No cross-origin isolation** on GitHub Pages, so WASM is single-threaded.
- **`src/main.ts` unregisters** the service worker earlier versions installed;
  remove that once old installs are gone.

## Working on it

- Svelte 5 with runes, TypeScript strict, Prettier (`npm run format`).
- Every module and component starts with a short comment saying what it is;
  comment the why of anything non-obvious.
- Tests sit next to the code: `src/core/**/*.test.ts` run in Node,
  `src/engine/**/*.test.ts` in headless Chromium. Check UI changes in a real
  browser.
- Use the latest stable version of every dependency and tool, pinned exactly.
  The one exception: TypeScript stays on 6 because `svelte-check` doesn't
  support 7 yet.
- After a change, run `npm run check`, then commit (conventional commits:
  `feat:`, `fix:`…, one commit per coherent change). A push to `master`
  deploys.
- Keep `docs/` in step with the code in the same commit.
