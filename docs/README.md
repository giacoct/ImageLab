# ImageLab

Personal, self-hosted image tools in the browser. Almost all processing
happens locally in the browser with native APIs; **Convert to SVG**,
**Extract text (OCR)**, and **Upscale image** send the image to the small
FastAPI backend that runs alongside the app (see [api.md](api.md)).

## Tools

- **Resize & transform** – rotate, flip, crop, and resize a single image with a
  live preview.
- **Batch scale** – scale many images by percentage or fit each inside a
  bounding box.
- **Convert format** – export images as JPEG, PNG, WebP, AVIF (where the
  browser supports encoding it), or ICO icons (16–256 px, letterboxed).
- **Convert to SVG** – trace images into scalable vector SVGs (VTracer;
  automatic or manual settings).
- **Compress** – reduce file size at a fixed quality, or compress each image to
  fit a target file size.
- **Strip metadata** – inspect the embedded EXIF data (camera, capture date,
  GPS presence, …) and rebuild images without it.
- **Remove background** – key out a color and export a transparent PNG, with a
  live preview.
- **Adjust & filters** – brightness, contrast, saturation, grayscale, sepia,
  invert, blur, and sharpen.
- **Add margin** – surround images with a colored or transparent margin
  (uniform or per-side, measured in pixels or percent), with a live preview.
- **Merge images** – combine several images into one, stacked vertically or
  side by side.
- **Upscale image** – enlarge images 4× with AI super-resolution
  (Real-ESRGAN) that rebuilds real detail.
- **Extract text (OCR)** – recognize the text in one or more images and select
  it directly on the picture; copy it or download it as `.txt` (Tesseract).

Every tool except Resize supports batch processing, and the output of one tool
can be sent straight into another (tool chaining). Tools accept JPEG, PNG,
and WebP; iPhone **HEIC/HEIF** photos are converted to JPEG by the backend as
they are imported (keeping their color profile and EXIF). Imported images can
be pasted from the clipboard and drag-reordered (the order carries through the
whole tool), and batch results can be renamed, reordered, and downloaded
individually or as a single ZIP. If some files in a batch fail, the rest still
complete and the failures are reported. Each tool remembers its last-used
settings. Heavy per-pixel work runs in a Web Worker so the UI stays responsive.

Output keeps the source format and 100% quality, except **Convert** (you choose
the format), **Compress** (you choose the quality or size budget), **Remove
background** and **Merge** (always PNG), **Upscale** (PNG), **Convert to SVG**
(SVG), and **Extract text** (plain text).

## Getting started (development, macOS)

Prerequisites: Node.js 26 (`brew install node`), Python 3.13
(`brew install python@3.13`; 3.12 also works), and Tesseract for OCR
(`brew install tesseract tesseract-lang`).

```bash
npm run dev
```

The first run installs everything (frontend packages, the backend virtualenv,
the upscaler model) and then starts the app at <http://localhost:4200/> with
the backend on port 4201. Ctrl+C stops both.

## Commands

All commands run from the repo root.

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `npm run setup`  | Install or update all dependencies (safe to re-run; `dev` runs it). |
| `npm run dev`    | Development: backend :4201 + Angular dev server :4200.              |
| `npm test`       | Frontend unit tests (Vitest) and backend tests (pytest).            |
| `npm run build`  | Production build of the frontend into `frontend/dist/browser`.      |
| `npm start`      | Production server on port 4200 (app + API in one process).          |
| `npm run format` | Format the frontend code with Prettier.                             |

## Production

ImageLab runs on a Linux PC on the LAN as a systemd service — see
[deployment.md](deployment.md).

## Documentation

- [architecture.md](architecture.md) — how the code is organized, conventions,
  and the invariants that are easy to break. Start here before changing code.
- [api.md](api.md) — the backend endpoints and its non-pip dependencies.
- [deployment.md](deployment.md) — installing and updating the production PC.

## Tech stack

Angular 22 (standalone components, signals, lazy-loaded routes), TypeScript,
and the browser Canvas API — no third-party image-processing libraries in the
browser. Backend: FastAPI with VTracer, Tesseract (pytesseract), and
Real-ESRGAN (onnxruntime, CPU).
