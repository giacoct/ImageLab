# ImageLab — agent context

Read this first when working on the repo. It explains what the project is, how
the code is organized, and the conventions to follow. Human-facing docs:
[README.md](README.md) (product + dev commands) and
[server/README.md](server/README.md) (backend API).

## What this is

A self-hosted web app of browser-based image tools (resize, convert, compress,
strip metadata, remove background, adjust, margin, merge, batch scale, SVG
tracing, OCR, AI upscale). Angular 22 frontend + a small FastAPI backend.
Almost all image processing runs **client-side** with Canvas APIs; only three
tools call the backend: **Convert to SVG** (VTracer), **Extract text / OCR**
(Tesseract), and **Upscale image** (Real-ESRGAN via onnxruntime, CPU).

## Repository map

```
src/app/
  app.routes.ts                 # routes generated from the tool registry
  core/
    models/                     # ImageToolDefinition, ImageOutput, OcrResult
    services/
      tool-registry.service.ts  # IMAGE_TOOLS: the single list of all tools
      tool-session.service.ts   # in-flight workflow state (files → outputs)
      tool-settings.store.ts    # per-tool persisted settings (localStorage)
      image-processing.service.ts
      vectorize.service.ts / ocr.service.ts / upscale.service.ts  # /api calls
      download.service.ts       # single/ZIP downloads
      workflow-reuse.strategy.ts# RouteReuseStrategy for the 3-step flow
    utils/                      # pure helpers (exif, margins, merge layout…) + specs
    workers/                    # pixel.worker.ts + client; heavy per-pixel ops
  pages/                        # shared step pages: home, import, output, settings
  shared/                       # dumb reusable components (dropzone, icons…)
  tools/<tool-id>/              # one folder per tool: settings page component
server/
  app.py                        # the whole FastAPI backend (single file)
  requirements.txt
  models/                       # realesr-general-x4v3.onnx (gitignored; see below)
scripts/dev.mjs                 # `npm run dev`: venv bootstrap + both dev servers
docker/                         # nginx.conf + entrypoint.sh for the image
Dockerfile                      # multi-stage: web build → model fetch → runtime
.github/workflows/docker.yml    # CI: test → build → push :latest to GHCR
```

## Architecture essentials

- **Tool registry drives everything.** `IMAGE_TOOLS` in
  `tool-registry.service.ts` is the one place a tool is declared (id, title,
  route, accepted types, batch support, lazy component). Routes, the home
  dashboard, and tool chaining all derive from it. The dashboard and nav list
  tools alphabetically. To add a tool: create `src/app/tools/<id>/`, register
  it there, and (if it needs new pixel math) extend the worker ops.
- **Every tool is the same 3-step workflow**: `/tools/<id>/import` →
  `/tools/<id>/settings` (the tool's own component) → `/tools/<id>/output`.
  `ToolSessionService` holds the in-flight state (files, outputs, progress,
  errors) so it survives navigation between the steps; batch processing keeps
  running when the settings page is destroyed. Tools whose result isn't
  downloadable images (OCR) provide a custom `outputComponent`.
- **Batch semantics**: per-file failures don't abort the batch; failures are
  reported alongside successful outputs. Output of one tool can be chained
  into another.
- **Heavy per-pixel work runs in a Web Worker** (`core/workers/`): pure
  functions in `pixel-ops.ts` (unit-tested) executed inside `pixel.worker.ts`,
  called through `pixel-worker.client.ts`.
- **Settings persistence**: each tool remembers its last-used settings via
  `tool-settings.store.ts` (localStorage).
- **Backend calls** go to relative `/api/...` URLs. In dev, the Angular dev
  server proxies `/api` → `localhost:4201` (`proxy.conf.json`); in production,
  nginx inside the container does the same. The backend itself serves `/`
  (no `/api` prefix) — the proxy strips it.
- **Backend** (`server/app.py`, single file): `POST /vectorize`, `POST /ocr`,
  `POST /upscale`, `GET /health`. 10 MB upload cap. Upscale tiles the input
  and caps the longest side at 1500 px. Model weights load lazily on first
  upscale request.

## Cross-file invariants (easy to break)

- `OCR_LANGUAGES` in `src/app/tools/ocr/ocr.ts` must match the
  `tesseract-ocr-*` packages installed in the **Dockerfile** (currently
  English + Italian). Adding a language to the picker without adding its
  Debian package makes OCR fail at runtime for that language.
- The upscaler model is **not in git**. The Dockerfile downloads it from the
  repo's `models-v1` GitHub release, pinned by sha256 (build args `MODEL_URL`
  / `MODEL_SHA256`). `server/app.py` resolves it as
  `<dir-of-app.py>/models/realesr-general-x4v3.onnx`. For local dev, download
  it once into `server/models/` (command in server/README.md) — without it
  only `/upscale` fails.
- nginx's `client_max_body_size 12m` (docker/nginx.conf) must stay ≥ the
  backend's `MAX_UPLOAD_BYTES` (10 MB) or uploads die at the proxy with an
  unhelpful error.
- Angular production budgets (angular.json): initial bundle warn 500 kB /
  error 1 MB; per-component styles warn 6 kB / error 8 kB. A failing budget
  fails the build and therefore CI.

## Commands

```bash
npm run dev     # backend (:4201, venv auto-bootstrap) + frontend (:4200)
npm start       # frontend only (all tools except SVG/OCR/upscale work)
npm test        # Vitest via Angular CLI — CI blocks on this
npm run build   # production build into dist/ImageLab/browser
docker build -t imagelab .        # full production image
docker run --rm -p 4200:80 imagelab   # run it locally (host port 4200)
```

There is no lint script; formatting is Prettier (`.prettierrc`, 100 columns,
single quotes) and `.editorconfig`. All text files are LF (`.gitattributes`).

## Deployment model

One self-contained Docker image (`Dockerfile`): nginx on :80 serves the built
SPA (with SPA fallback and immutable-asset caching) and proxies `/api/` to
uvicorn on loopback :4201 in the same container; `docker/entrypoint.sh`
supervises both processes. Tesseract and the model weights are baked in at
build time — the container needs no volumes, env vars, or network besides its
port.

Deployment is pull-based, with **no SSH from CI to the server**. CI
(`.github/workflows/docker.yml`): every push to `master` runs the unit tests,
then builds and pushes the public `ghcr.io/giacoct/imagelab:latest`. On the
server, Watchtower polls that tag every minute and recreates the container when
the digest changes. The server is bootstrapped once with two `docker run`
commands (the app + Watchtower) — no compose file, no volumes. See the README's
deployment section.

## Conventions

- Angular: standalone components, signals (`signal`/`computed`), `inject()`
  instead of constructor injection, lazy `loadComponent` routes. No NgModules.
- Tests live next to the code as `*.spec.ts` (Vitest). Pure logic (utils,
  worker ops) is where the test coverage is concentrated — keep new pixel math
  pure and tested.
- Frontend has **no third-party image-processing dependencies**; prefer native
  browser APIs. Anything that genuinely can't run in the browser belongs in
  `server/app.py`.
- Commit messages follow conventional-commit style (`feat:`, `fix:`, …), in
  the imperative.
