# ImageLab — architecture & conventions

Read this first when working on the repo (it is also the agent context that
`CLAUDE.md` imports). It explains how the code is organized and the rules to
follow. Other docs: [README](README.md) (what it is, commands),
[api.md](api.md) (backend endpoints), [deployment.md](deployment.md)
(production on the Linux PC).

## What this is

A personal, self-hosted web app of image tools (resize, convert, compress,
strip metadata, remove background, adjust, margin, merge, batch scale, SVG
tracing, OCR, AI upscale). It runs on a Mac for development and on one Linux
PC on the LAN in production — no cloud, no containers, no CI. Keep solutions
simple and proportionate to that.

Almost all image processing runs **in the browser** with the Canvas API. Only
three tools call the backend: **Convert to SVG** (VTracer), **Extract text /
OCR** (Tesseract), and **Upscale image** (Real-ESRGAN via onnxruntime, CPU).

## Repository map

```
package.json            # scripts only: setup, dev, build, test, start, format
scripts/
  setup.mjs             # installs deps, backend venv, model weights; checks Tesseract
  dev.mjs               # npm run dev: backend :4201 + Angular dev server :4200
  install-service.sh    # production: systemd unit (Linux)
docs/                   # all documentation
backend/                # FastAPI (Python)
  main.py               # HTTP layer: /api routes + serves the built frontend
  vectorize.py ocr.py upscale.py heic.py   # processing, no HTTP knowledge
  images.py             # shared decode helper + the two error types
  tests/                # pytest
  models/               # Real-ESRGAN weights (gitignored, downloaded by setup)
frontend/               # Angular 22 app (its own package.json / angular.json)
  src/styles.css        # design tokens + shared building blocks (buttons, forms, previews)
  src/app/
    app.*               # root shell (header + router outlet)
    app.routes.ts       # routes, generated from the tool registry
    tool-registry.ts    # TOOLS: the single list of all tools
    domain/             # pure TypeScript: models + logic (unit-tested here)
    services/           # Angular services: session, canvas rendering, backend, downloads, worker
    shared/             # reusable components (tool-shell, file-list, output-list, ...)
    pages/              # home/, import/, output/: the pages shared by every tool
    tools/              # base-tool.ts + one folder per tool (its settings page)
```

## Frontend architecture

**Layers and the dependency rule.** Imports only point inward:

```
pages/, tools/, shared/   (UI: components)
        ↓
services/                 (Angular services: state, Canvas, fetch, Web Worker)
        ↓
domain/                   (pure TS: no Angular, no DOM rendering — easy to test)
```

`app.routes.ts` and `tool-registry.ts` sit on top and wire everything
together. If logic doesn't need Angular or the DOM, it belongs in `domain/`
with a `*.spec.ts` next to it.

**Folders.** Every page and component has its own folder containing
`<name>.ts`, `<name>.html` and `<name>.css` (a tool with no styles of its own
keeps a one-line `.css` saying so). The only exception is the `reorderable`
directive, which has no template. Shared look-and-feel lives in
`src/styles.css` (tokens, `.button`, `.panel`, `.field`, `.tool-fields`,
`.preview-stage`, ...); component CSS holds only what is specific to it.

**Tool registry drives everything.** `TOOLS` in `tool-registry.ts` declares
each tool (id, title, description, batch or single, lazy settings page). The
routes, the home dashboard, and tool chaining all derive from it.
To add a tool:

1. create `tools/<id>/<id>.ts|html|css` with a component extending `BaseTool`
   (use `<app-tool-shell>` in the template for the standard layout);
2. add an entry to `TOOLS`;
3. add an icon `@case ('<id>')` in `shared/icon/icon.html`;
4. put any new pure logic in `domain/` (tested) and rendering in
   `ImageProcessingService`.

**Every tool is the same 3-step workflow**: `/tools/<id>/import` (shared
`ImportPage`) → `/tools/<id>/settings` (the tool's own page) →
`/tools/<id>/output` (shared `OutputPage`, which shows image cards or, for OCR,
the recognized text).

- `ToolSessionService` holds the in-flight state (files, outputs, OCR results,
  progress, errors), so it survives navigation between the steps and a batch
  keeps running when the settings page is left.
- `WorkflowReuseStrategy` keeps the three pages of the current tool alive
  while moving between steps. Consequence: a re-attached page does **not**
  run `ngOnInit` again — react to changing state with signals/effects (e.g.
  `BaseTool` calls `onFilesSelected` from an effect on the file list).
- Leaving a tool (home, another tool) resets the session.
- Tools only ever see JPEG/PNG/WebP (`ACCEPTED_TYPES`): HEIC/HEIF photos are
  converted by the backend (`/api/heic`) as they are imported.

**Batch semantics.** Per-file failures don't abort a batch: successful outputs
are kept and failures are summarized in the error message. Outputs of one tool
can be chained into another (raster outputs only, not SVG/ICO).

**Heavy per-pixel work** (sharpen, background key on full-resolution exports)
runs in a Web Worker: pure functions in `domain/pixel-ops.ts` executed by
`services/pixel-worker/pixel.worker.ts` through `pixel-worker.client.ts`
(which falls back to running them inline if the worker is unavailable).

**Settings persistence.** `BaseTool.registerForm()` restores each tool's
last-used settings from `localStorage` and saves them on every change.

**Backend calls** (`services/backend.service.ts`) use `fetch` on relative
`/api/...` URLs. Files the backend would reject (over the size limit, or too
large to upscale — limits come from `GET /api/limits`) fail before upload, and
the settings pages of the backend tools list them up front
(`<app-tool-shell uploadCheck="size|upscale">`). In development the Angular dev server proxies `/api` to the
backend on :4201 (`frontend/proxy.conf.json`); in production the backend
serves both the app and `/api` on one port, so no proxy is involved.

## Backend architecture

`main.py` is the only module that knows about HTTP: it validates uploads
(`read_image_upload`: type, empty, 10 MB cap), runs the processing in a thread
pool (`run_job`) and maps errors to status codes — `BadInputError` → 400,
`MissingDependencyError` → 503, anything else → 500 with a generic message.
It also serves `frontend/dist/browser` with an SPA fallback to `index.html`.

`vectorize.py`, `ocr.py`, `upscale.py` and `heic.py` take image bytes and
return the result (SVG text, a dict, PNG bytes, converted image bytes). The upscaler caps input at 1500 px,
processes it in tiles, and loads the ONNX model lazily on first use.

## Cross-file invariants (easy to break)

- **Model weights are not in git.** `scripts/setup.mjs` downloads them from the
  repo's `models-v1` GitHub release, pinned by sha256, into
  `backend/models/realesr-general-x4v3.onnx`. Without the file only
  `/api/upscale` fails (503).
- **Python 3.14.** `backend/requirements.txt` is pinned for it (onnxruntime
  has no 3.15 wheels; vtracer 0.6 segfaults on 3.14, hence its 1.0 alpha).
  `SUPPORTED_PYTHON` in `setup.mjs` requires it and rebuilds a venv made with
  another version.
- **Build output path.** `angular.json` builds to `frontend/dist/browser`;
  `FRONTEND_DIR` in `backend/main.py` serves that folder.
- **Angular budgets** (`angular.json`): initial bundle warn 500 kB / error
  1 MB; per-component styles warn 6 kB / error 8 kB. A failing budget fails
  the build.

## Commands

```bash
npm run setup    # install/update everything (safe to re-run)
npm run dev      # backend :4201 + frontend :4200 (runs setup first)
npm test         # frontend (Vitest) + backend (pytest)
npm run build    # production build → frontend/dist/browser
npm start        # production server on :4200 (serves the build + /api)
npm run format   # Prettier over the frontend
```

## Conventions

- Angular: standalone components, signals (`signal` / `computed` / `effect`),
  `inject()` instead of constructor injection, `OnPush`, lazy
  `loadComponent` routes. No NgModules.
- Every class/component starts with a short doc comment saying what it is;
  comment the *why* of anything non-obvious, not the *what*.
- Tests live next to the code (`*.spec.ts` with Vitest; `backend/tests/` with
  pytest). Keep new pixel/geometry math pure and tested.
- The frontend has **no third-party image-processing dependencies**; prefer
  native browser APIs. Anything that genuinely can't run in the browser
  belongs in the backend.
- Formatting: Prettier for the frontend (`frontend/.prettierrc`, 100 columns,
  single quotes) and `.editorconfig`; Python follows PEP 8 with ~100-column
  lines. All text files are LF (`.gitattributes`).
- **Always use the latest stable version** of the tools and packages in use
  (npm and pip dependencies, Node.js, Python, CLI tools). Python packages are
  pinned exactly in `backend/requirements.txt`; bump the pins (and run
  `npm run setup`) when touching the backend. Stay behind only for a hard,
  documented reason, recorded next to the pin. Today: Python 3.14, not 3.15
  (the newest the production server can install), and TypeScript 6.0, not 7
  (Angular 22 supports only TypeScript 6.0).
- **Always commit and push after a change.** One commit per coherent change:
  don't flood the history with tiny commits, but don't bundle unrelated
  features or fixes together either. Commit messages follow conventional-commit
  style (`feat:`, `fix:`, …), in the imperative.
- Keep the docs in `docs/` up to date in the same change as the code.
