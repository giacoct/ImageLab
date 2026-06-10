# ImageLab

Browser-based image tools. Almost all processing happens locally on your device
using native browser APIs — the one exception is **Convert to SVG**, which sends
the image to a small self-hosted vectorizer service (see [`server/`](server/README.md)).

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
- **Watermark** – stamp a text watermark (position, size, opacity, color) with
  a live preview.
- **Adjust & filters** – brightness, contrast, saturation, grayscale, sepia,
  invert, blur, and sharpen.

Every tool except Resize supports batch processing, and the output of one tool
can be sent straight into another (tool chaining). Batch results can be
renamed, reordered, and downloaded individually or as a single ZIP. If some
files in a batch fail, the rest still complete and the failures are reported.
Each tool remembers its last-used settings. Heavy per-pixel work runs in a Web
Worker so the UI stays responsive on large batches.

Output keeps the source format and 100% quality, except **Convert** (you choose
the format), **Compress** (you choose the quality or size budget), **Remove
background** (always PNG), and **Convert to SVG** (always SVG).

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
browser; vectorization is delegated to a FastAPI + VTracer backend.
