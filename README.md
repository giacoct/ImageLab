# ImageLab

Browser-based image tools. Almost all processing happens locally on your device
using native browser APIs — the exceptions are **Convert to SVG** and **Extract
text (OCR)**, which send the image to a small self-hosted backend (see
[`server/`](server/README.md)).

## Tools

- **Resize & transform** – rotate, flip, crop, and resize a single image with a
  live preview.
- **Batch scale** – scale many images by percentage or fit each inside a
  bounding box.
- **Convert format** – export images as JPEG, PNG, WebP, AVIF (where the
  browser supports encoding it), or ICO icons (16–256 px, letterboxed).
- **Convert to SVG** – trace images into scalable vector SVGs (VTracer backend;
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
- **Extract text (OCR)** – recognize the text in one or more images and select
  it directly on the picture; copy it or download it as `.txt`. Backed by a
  self-hosted Tesseract service (see [`server/`](server/README.md)).

Every tool except Resize supports batch processing, and the output of one tool
can be sent straight into another (tool chaining). Imported images can be
drag-reordered on the import step (the order carries through the whole tool),
and batch results can be renamed, reordered, and downloaded individually or as
a single ZIP. If some files in a batch fail, the rest still complete and the
failures are reported.
Each tool remembers its last-used settings. Heavy per-pixel work runs in a Web
Worker so the UI stays responsive on large batches.

Output keeps the source format and 100% quality, except **Convert** (you choose
the format), **Compress** (you choose the quality or size budget), **Remove
background** (always PNG), **Convert to SVG** (always SVG), and **Extract text
(OCR)** (plain text).

## Development

Start the full local dev environment — the Angular dev server at
`http://localhost:4200/` plus the FastAPI vectorizer backend on port 4201
(bootstrapped automatically on first run):

```bash
npm run dev
```

Or start only the frontend (every tool except Convert to SVG works without the
backend):

```bash
npm start
```

## Building

Build for production into `dist/`:

```bash
npm run build
```

## Testing

Run the unit tests (Vitest, via the Angular CLI):

```bash
npm test
```

## Deployment

Pushing to `master` triggers GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), which builds
the app and rsyncs both the frontend and the backend to the server over
Tailscale. The one-time host bootstrap is automated by
[`server/setup-host.sh`](server/setup-host.sh) — see
[`server/README.md`](server/README.md).

## Tech stack

Angular 22 (standalone components, signals, lazy-loaded routes), TypeScript, and
the browser Canvas API. No third-party image-processing dependencies in the
browser; vectorization and OCR are delegated to a FastAPI backend (VTracer and
Tesseract).
