"""ImageLab vectorizer service.

A small FastAPI wrapper around VTracer (https://github.com/visioncortex/vtracer)
that converts an uploaded raster image into a compact, smooth color SVG and
returns it inline. The Angular app calls this through nginx at ``/api/vectorize``.
"""

from __future__ import annotations

import vtracer
from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.responses import Response

app = FastAPI(title="ImageLab Vectorizer", version="1.0.0")

# Reject oversized uploads early (matches the nginx client_max_body_size guard).
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

# Map an incoming content-type to the format string VTracer expects.
CONTENT_TYPE_TO_FORMAT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}

VALID_MODES = {"spline", "polygon", "none"}
VALID_HIERARCHICAL = {"stacked", "cutout"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/vectorize")
async def vectorize(
    file: UploadFile,
    color_precision: int = Form(6),
    filter_speckle: int = Form(4),
    corner_threshold: int = Form(60),
    mode: str = Form("spline"),
    hierarchical: str = Form("stacked"),
) -> Response:
    image_format = CONTENT_TYPE_TO_FORMAT.get((file.content_type or "").lower())
    if image_format is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPEG, or WebP.",
        )

    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode!r}.")
    if hierarchical not in VALID_HIERARCHICAL:
        raise HTTPException(status_code=400, detail=f"Invalid hierarchical: {hierarchical!r}.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    try:
        svg = vtracer.convert_raw_image_to_svg(
            data,
            img_format=image_format,
            colormode="color",
            mode=mode,
            hierarchical=hierarchical,
            filter_speckle=max(0, filter_speckle),
            color_precision=max(1, min(8, color_precision)),
            corner_threshold=max(0, min(180, corner_threshold)),
        )
    except Exception as error:  # noqa: BLE001 - surface a clean 500 to the client
        raise HTTPException(status_code=500, detail="Vectorization failed.") from error

    return Response(content=svg, media_type="image/svg+xml")
