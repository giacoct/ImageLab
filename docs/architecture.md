# ImageLab: how it's built

## The core

ImageLab is a suite of image-editing tools that can be chained without limit.
Everything follows from that:

- **A tool is a step.** Each of the tools is one operation (`src/ops/`), and
  the home page and "Add a step" list the same operations (`OPS` in
  `src/ops/index.ts`). There is no tool that isn't a step.
- **A chain is a list of steps** (`Step` in `src/core/recipe.ts`). Opening a
  tool starts a chain with that tool alone; any tool can follow, any number
  of times. A saved recipe is a named chain.
- The only limits are the ones the output imposes: Convert to SVG and Extract
  text produce something other than an image, so they end the chain, and a
  chain merges its images at most once.

It's a personal project: a static site with no backend, hosted on GitHub
Pages. Keep every solution simple and proportionate.

## Layers

Imports only point downward:

```
src/ui/      Svelte components
src/app/     state (Svelte runes): session, saved chains, router, theme
src/engine/  Web Workers: decode, run the chain, encode
src/ops/     the tools: settings schema + run
src/core/    pure TypeScript (no DOM), unit-tested in Node
```

## Operations

An operation declares its settings once with the builders in
`src/core/params.ts`; the schema gives the defaults, validates stored values,
and generates the settings form in the UI. Its `run` works on an
`OffscreenCanvas`. There are five kinds (`src/ops/op.ts`):

- `map`: one image in, one image out (most tools);
- `combine`: all images in, one out (Merge images);
- `file`: works on how the image is saved (Convert format, Compress, Strip
  metadata);
- `svg` and `text`: end the chain with SVG markup or recognized text.

Each image travels through the chain as a `Picture` (`src/engine/encode.ts`):
its pixels, how it will be saved (`Encoding`, `src/core/encoding.ts`, which
starts as the input's format), and the file holding exactly those pixels, if
there is one. Pixels are decoded once and the file is written once at the end,
unless a Convert format or Compress step already wrote it and nothing changed
the pixels since. Those two steps write the file right where they are, so the
steps after them, and the preview, see the real result.

To add a tool: create `src/ops/<id>.ts`, add it to `OPS`, and add an engine
test. Put any pure math in `src/core/` with a unit test. In `run`:

- multiply any setting given in pixels by `context.scale`, because the live
  preview runs the same code on a downscaled copy;
- throw an `Error` with a message for the user when the input is unusable;
- mark slow ML tools `heavy`: they run one image at a time, and the preview
  stops before them.

## Engine

`src/engine/client.ts` keeps a pool of workers (so loaded models stay warm)
plus one for previews. `src/engine/pipeline.ts` runs a chain on each image,
or on all of them when the chain merges, and renders previews from a cached
copy of each image downscaled to 1600 px at most. Decoding uses the browser,
and libheif (WASM) for HEIC; JPEG, WebP and AVIF are encoded with the Squoosh
codecs (WASM), PNG by the browser.

## UI

Barebone and functional: native controls (`<select>`, `<progress>`,
`<details>`, `prompt()`), the system font, text instead of icons, no
animations, a small `src/styles.css`. Colors follow the system light/dark
scheme, which the header's theme menu can override. Images can be dropped or
pasted on any page, and stay loaded across tools.

## Things that are easy to break

- **Runtime assets aren't in git.** `scripts/assets.mjs` (run before `dev`,
  `build`, `test` and `check`) copies the OCR worker, WASM and language data
  into `public/vendor/` and downloads the upscaler weights (pinned by
  sha256) into `public/models/`. OCR languages are listed both there and in
  `src/core/ocr.ts`.
- **Other WASM modules are bundled by Vite** and must stay in
  `optimizeDeps.exclude` in `vite.config.ts`.
- **The base path is relative** (`base: './'`), so the site works under
  `/ImageLab/`: use relative URLs.
- **No cross-origin isolation** on GitHub Pages, so WASM is single-threaded.
- **The theme's storage key** (`imagelab:theme`) is read by the inline script
  in `index.html` and by `src/app/theme.svelte.ts`.
- **The service worker** (`src/sw.js`) gets the list of build files from a
  plugin in `vite.config.ts`, and caches them for offline use.

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
  `feat:`, `fix:`…, one commit per coherent change) and push. A push to
  `master` deploys.
- Keep `docs/` in step with the code in the same commit.
