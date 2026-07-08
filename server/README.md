# ImageLab backend service

A small FastAPI service behind the Angular app at `/api`. It wraps
[VTracer](https://github.com/visioncortex/vtracer) for vectorization,
[Tesseract](https://github.com/tesseract-ocr/tesseract) (via
[`pytesseract`](https://pypi.org/project/pytesseract/)) for OCR, and
Real-ESRGAN (via [`onnxruntime`](https://onnxruntime.ai/)) for AI upscaling.

## API

`POST /vectorize` accepts a multipart `file` (PNG/JPEG/WebP) and returns
`image/svg+xml`. With `preset=auto` the service analyzes the image itself:
flat art (logos/illustrations) is upscaled and de-antialiased before tracing,
photos get noise suppression and harder layer merging. With `preset=manual`
the individual form fields apply — `mode` (`spline`/`polygon`),
`hierarchical` (`stacked`/`cutout`), `color_precision`, `filter_speckle`,
`corner_threshold`, `length_threshold`, `splice_threshold`, `path_precision`,
`max_iterations`, `layer_difference`.

`POST /ocr` accepts a multipart `file` (PNG/JPEG/WebP) plus a `lang` field
(Tesseract language code, default `eng`; combine with `+`, e.g. `eng+fra`) and
returns JSON `{width, height, text, words}`, where each word carries its pixel
bounding box, confidence, and line index — the app turns those boxes into a
selectable text layer over the image.

`POST /upscale` accepts a multipart `file` (PNG/JPEG/WebP) and returns a 4×
super-resolved `image/png`. It runs Real-ESRGAN (`realesr-general-x4v3`) via
onnxruntime on CPU — a learned model that rebuilds detail and cleans
noise/JPEG artifacts rather than interpolating. Inputs are tiled so memory
stays bounded, and the longest side is capped at 1500&nbsp;px (6000&nbsp;px
out) to keep a single request within time/memory budget.

`GET /health` returns `{"status":"ok"}`.

## Non-pip dependencies

Two things the service needs that `pip install` does not provide. In the
production Docker image both are baked in at build time (see the root
[`Dockerfile`](../Dockerfile)); for local dev you install them once yourself:

- **Tesseract binary + language packs.** `pytesseract` shells out to
  `tesseract`. Install it at the OS level:

  ```bash
  # Debian/Ubuntu
  sudo apt-get install -y tesseract-ocr tesseract-ocr-ita   # English + Italian
  # macOS
  brew install tesseract tesseract-lang
  # Windows: https://github.com/UB-Mannheim/tesseract/wiki
  ```

  The language picker in the app (`OCR_LANGUAGES` in
  `src/app/tools/ocr/ocr.ts`) must stay in sync with the packs actually
  installed — in production that means the `tesseract-ocr-*` packages listed
  in the Dockerfile.

- **Upscaler model weights** (`realesr-general-x4v3.onnx`, ≈4.9 MB). Kept out
  of git; published on the repo's
  [`models-v1` release](https://github.com/giacoct/ImageLab/releases/tag/models-v1).
  The Docker build downloads and checksum-verifies them. For local dev,
  download once into `server/models/`:

  ```bash
  curl -fSL --create-dirs -o server/models/realesr-general-x4v3.onnx \
    https://github.com/giacoct/ImageLab/releases/download/models-v1/realesr-general-x4v3.onnx
  ```

  Without the file, every endpoint except `/upscale` still works; `/upscale`
  returns an error saying the model is not installed.

## Local development

From the repo root, one command starts **both** the backend and the Angular dev
server (it bootstraps the venv on first run):

```bash
npm run dev
```

The Angular dev server proxies `/api` to `http://localhost:4201` (see
`proxy.conf.json`), so the backend-based tools work end to end locally.

To run just the backend manually:

```bash
cd server
python -m venv .venv
# Windows:  .venv\Scripts\pip install -r requirements.txt
# Linux:    .venv/bin/pip  install -r requirements.txt
uvicorn app:app --port 4201 --reload
curl -F file=@some-logo.png http://localhost:4201/vectorize -o out.svg   # smoke test
```

## Deployment

The backend ships inside the single ImageLab Docker image together with the
frontend — see [Deployment in the root README](../README.md#deployment).
Inside the container, uvicorn listens on `127.0.0.1:4201` and nginx proxies
`/api/` to it, so the backend is never exposed directly.
