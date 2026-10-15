"""ImageLab backend: a small FastAPI app.

- ``/api/*``: the three tools that can't run in the browser — vectorize
  (VTracer), ocr (Tesseract) and upscale (Real-ESRGAN). The processing lives in
  ``vectorize.py``, ``ocr.py`` and ``upscale.py``; this module only handles HTTP.
- everything else: the built Angular app from ``frontend/dist/browser`` (with
  SPA fallback to ``index.html``), so production is a single process. In
  development the Angular dev server serves the app and proxies ``/api`` here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, FastAPI, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response

import ocr
import upscale
import vectorize
from images import BadInputError, MissingDependencyError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ACCEPTED_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "browser"

app = FastAPI(title="ImageLab")
api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.post("/vectorize")
async def vectorize_image(
    file: UploadFile,
    preset: str = Form("manual"),
    mode: str = Form("spline"),
    color_precision: int = Form(6),
    filter_speckle: int = Form(4),
    corner_threshold: int = Form(60),
    length_threshold: float = Form(4.0),
) -> Response:
    data = await read_image_upload(file)
    svg = await run_job(
        "Vectorization failed.",
        vectorize.vectorize,
        data,
        preset=preset,
        mode=mode,
        color_precision=color_precision,
        filter_speckle=filter_speckle,
        corner_threshold=corner_threshold,
        length_threshold=length_threshold,
    )
    return Response(content=svg, media_type="image/svg+xml")


@api.post("/ocr")
async def ocr_image(file: UploadFile, lang: str = Form("eng")) -> dict:
    data = await read_image_upload(file)
    return await run_job("OCR failed.", ocr.recognize, data, lang)


@api.post("/upscale")
async def upscale_image(file: UploadFile) -> Response:
    data = await read_image_upload(file)
    png = await run_job("Upscaling failed.", upscale.upscale, data)
    return Response(content=png, media_type="image/png")


app.include_router(api)


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str) -> FileResponse:
    """Serve the built Angular app; unknown paths fall back to index.html (SPA routing)."""
    if path == "api" or path.startswith("api/") or not FRONTEND_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Not found.")

    file = (FRONTEND_DIR / path).resolve()
    if path and file.is_file() and file.is_relative_to(FRONTEND_DIR):
        return FileResponse(file)
    # index.html must be revalidated so a fresh build is picked up immediately;
    # the other build assets have content hashes in their names.
    return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})


async def read_image_upload(file: UploadFile) -> bytes:
    """Validate an uploaded image (type, emptiness, size) and return its bytes."""
    if (file.content_type or "").lower() not in ACCEPTED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPEG, or WebP.")

    # Reject by declared size before reading the body into memory.
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")
    return data


async def run_job(failure_message: str, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Run CPU-bound processing off the event loop, mapping its errors to HTTP.

    Running in the threadpool keeps /api/health and concurrent requests
    responsive while an image is being processed.
    """
    try:
        return await run_in_threadpool(func, *args, **kwargs)
    except BadInputError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except MissingDependencyError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001 - never leak internals; give a clean 500
        raise HTTPException(status_code=500, detail=failure_message) from error
