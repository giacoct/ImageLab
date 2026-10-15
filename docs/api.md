# Backend API

A small FastAPI app in `backend/` (see [architecture.md](architecture.md#backend-architecture)
for how it is organized). It wraps
[VTracer](https://github.com/visioncortex/vtracer) for vectorization,
[Tesseract](https://github.com/tesseract-ocr/tesseract) (via
[`pytesseract`](https://pypi.org/project/pytesseract/)) for OCR, and
Real-ESRGAN (via [`onnxruntime`](https://onnxruntime.ai/)) for AI upscaling.
It also serves the built Angular app, so in production everything is on one
port.

## Endpoints

All uploads are multipart forms with a `file` field: PNG, JPEG, or WebP, at
most 10 MB. Errors come back as JSON `{"detail": "<message for the user>"}`:
400 for bad input, 413 for oversized uploads, 503 when a server dependency
(Tesseract, the model) is missing, 500 for anything unexpected.

`POST /api/vectorize` returns `image/svg+xml`. With `preset=auto` the service
analyzes the image itself: flat art (logos/illustrations) is upscaled and
de-antialiased before tracing, photos get noise suppression and harder layer
merging. With `preset=manual` these form fields apply: `mode`
(`spline`/`polygon`), `color_precision` (1–8), `filter_speckle` (0–64),
`corner_threshold` (0–180), `length_threshold` (3.5–10).

`POST /api/ocr` takes a `lang` field (Tesseract language code, default `eng`;
combine with `+`, e.g. `eng+ita`) and returns JSON
`{width, height, text, words}`, where each word carries its pixel bounding
box, confidence, and line index — the app turns those boxes into a selectable
text layer over the image.

`POST /api/upscale` returns a 4× super-resolved `image/png` (transparency is
kept). It runs Real-ESRGAN (`realesr-general-x4v3`) on CPU — a learned model
that rebuilds detail and cleans noise/JPEG artifacts rather than
interpolating. Inputs are processed in tiles so memory stays bounded, and the
longest side is capped at 1500&nbsp;px (6000&nbsp;px out).

`GET /api/health` returns `{"status":"ok"}`.

Every other `GET` path serves the built frontend (`frontend/dist/browser`),
falling back to `index.html` so deep links like `/tools/resize/import` work.

## Non-pip dependencies

`npm run setup` handles the Python packages and downloads the model; two
things come from elsewhere:

- **Tesseract binary + language packs.** `pytesseract` shells out to
  `tesseract`. Install it at the OS level (English + Italian):

  ```bash
  sudo apt install -y tesseract-ocr tesseract-ocr-ita   # Debian/Ubuntu
  brew install tesseract tesseract-lang                 # macOS
  ```

  The language picker in the app (`OCR_LANGUAGES` in
  `frontend/src/app/tools/ocr/ocr.ts`) must only list installed packs.

- **Upscaler model weights** (`realesr-general-x4v3.onnx`, ≈4.9 MB). Kept out
  of git and published on the repo's
  [`models-v1` release](https://github.com/giacoct/ImageLab/releases/tag/models-v1);
  `npm run setup` downloads and checksum-verifies them into `backend/models/`.
  Without the file every endpoint except `/api/upscale` still works.

## Running the backend on its own

```bash
cd backend
.venv/bin/python -m uvicorn main:app --port 4201 --reload
curl -F file=@some-logo.png -F preset=auto http://localhost:4201/api/vectorize -o out.svg
.venv/bin/python -m pytest -q     # backend tests
```
