# ImageLab

Browser-based image tools. Almost all processing happens locally on your device
using native browser APIs — the exceptions are **Convert to SVG**, **Extract
text (OCR)**, and **Upscale image**, which send the image to a small
self-hosted backend (see [`server/`](server/README.md)).

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
- **Merge images** – combine several images into one, stacked vertically or
  side by side.
- **Upscale image** – enlarge images 4× with AI super-resolution
  (Real-ESRGAN on the backend) that rebuilds real detail.
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

Or start only the frontend (every tool works without the backend except
Convert to SVG, Extract text, and Upscale image):

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

The whole project ships as a **single Docker image**: nginx serves the built
Angular app and proxies `/api/` to the FastAPI backend running in the same
container. Tesseract (with the Italian language pack) and the Real-ESRGAN
upscaler weights are baked in at build time, so the image is fully
self-contained.

Pushing to `master` triggers GitHub Actions
([`.github/workflows/docker.yml`](.github/workflows/docker.yml)), which runs
the tests, then builds and pushes the image to GitHub Container Registry as
`ghcr.io/giacoct/imagelab:latest`. The package is public, so the server pulls
it without authenticating. CI never connects to the server.

### Run it on the server

Start the container once (it needs only Docker installed, serves on host port
4200):

```bash
docker run -d --name imagelab --restart unless-stopped -p 4200:80 \
  ghcr.io/giacoct/imagelab:latest
```

Update it manually whenever a new image has been published — pull the latest
tag and recreate the container:

```bash
docker pull ghcr.io/giacoct/imagelab:latest
docker rm -f imagelab
docker run -d --name imagelab --restart unless-stopped -p 4200:80 \
  ghcr.io/giacoct/imagelab:latest
docker image prune -f   # optional: drop the superseded image
```

To build and run the image locally instead of pulling it:

```bash
docker build -t imagelab .
docker run --rm -p 4200:80 imagelab
```

## Tech stack

Angular 22 (standalone components, signals, lazy-loaded routes), TypeScript, and
the browser Canvas API. No third-party image-processing dependencies in the
browser; vectorization, OCR, and AI upscaling are delegated to a FastAPI
backend (VTracer, Tesseract, and Real-ESRGAN via onnxruntime).

For a deeper tour of the codebase (architecture, conventions, and the request
flow), see [`AGENTS.md`](AGENTS.md).
