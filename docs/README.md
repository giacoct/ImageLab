# ImageLab

Personal image tools that run **entirely in the browser**. There is no
server: the app is a static site (hosted on GitHub Pages), and every image is
processed on the device that opens it, including OCR, SVG tracing and AI
upscaling, which run as WebAssembly. Photos never leave the device.

## Tools

- **Resize & transform**: rotate, flip, crop (free or to a ratio) and resize,
  with a live preview.
- **Scale**: by percentage, to fit a box, or to a width/height.
- **Convert format**: JPEG, PNG, WebP, AVIF or ICO icons (16–256 px,
  letterboxed).
- **Compress**: a chosen quality, or each file shrunk to fit a target size.
  JPEG, WebP and AVIF use the Squoosh encoders (MozJPEG, libwebp, libavif), so
  files are smaller than the browser's own encoder makes them, and the same in
  every browser.
- **Strip metadata**: shows what a photo embeds (camera, date, GPS, XMP, …) and
  removes it **without re-encoding**. The JPEG/PNG/WebP image data is copied
  byte for byte; the color profile and the orientation are kept.
- **Remove background**: key out a color (click the preview to pick it) to
  transparency.
- **Adjust & filters**: brightness, contrast, saturation, grayscale, sepia,
  invert, blur, sharpen.
- **Add margin**: colored or transparent, uniform or per side, in pixels or
  percent.
- **Merge images**: stacked or side by side, with alignment, gap and background.
- **Upscale 4×**: AI super-resolution (Real-ESRGAN) on the GPU (WebGPU), or on
  the CPU where WebGPU isn't available.
- **Convert to SVG**: VTracer, with automatic settings that tell logos from
  photos, or manual ones.
- **Extract text (OCR)**: Tesseract (English and Italian), with the text
  selectable right on the picture.

**Every tool is a recipe.** A tool opens with its own steps, but you can add,
remove and reorder steps freely (e.g. crop → remove background → add margin →
WebP), and **save the result as a recipe** of your own on the home page. Steps
run on the decoded pixels, and the image is encoded only once at the end, so
chaining doesn't lose quality. Results can also be handed on to another tool.

Every tool works on any number of images (a merge combines them all), and the
order you give them is kept. Images can be dropped anywhere on the page,
picked, or pasted, even on the home page before choosing a tool. iPhone
**HEIC** photos open everywhere. Results can be renamed and downloaded one by
one or as a ZIP. If some files fail, the rest still complete and the failures
are listed. Each tool remembers its last settings. The app works offline once
loaded, and can be installed as an app. It has a light and a dark theme
(following the device unless you pick one in the header).

## Getting started

Prerequisites: Node.js 26 (`brew install node`).

```bash
npm ci
npm run dev
```

Then open <http://localhost:4200/>.

## Commands

| Command           | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `npm run dev`     | Development server on :4200 (prepares the runtime assets first).    |
| `npm run check`   | Everything to pass before a commit: formatting, types, all tests.   |
| `npm test`        | Unit tests (Node) and engine tests in headless Chromium.            |
| `npm run build`   | Type-check, then build the static site into `dist/`.                |
| `npm run preview` | Serve `dist/` locally, as GitHub Pages would.                       |
| `npm run assets`  | Copy the OCR engine/language files and download the upscaler model. |
| `npm run format`  | Format everything with Prettier.                                    |

The browser tests need Playwright's Chromium once: `npx playwright install chromium`.

## Deployment

Every push to `master` is built and published to GitHub Pages by
`.github/workflows/pages.yml`; see [deployment.md](deployment.md).

## Documentation

- [architecture.md](architecture.md): how the code is organized, its
  conventions, and the invariants that are easy to break. Start here before
  changing code.
- [deployment.md](deployment.md): publishing on GitHub Pages, and browser
  requirements.

## Tech stack

TypeScript and Svelte 5 (runes), built with Vite. Images are processed in Web
Workers on `OffscreenCanvas`. WebAssembly modules handle what browsers can't
do natively: Squoosh codecs (`@jsquash/*`), libheif (`libheif-js`), VTracer
(`vtracer-wasm`), Tesseract (`tesseract.js`) and onnxruntime (`onnxruntime-web`).
Tests use Vitest (Node, plus browser mode with Playwright).
