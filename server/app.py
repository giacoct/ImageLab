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


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@app.post("/vectorize")
async def vectorize(
    file: UploadFile,
    mode: str = Form("spline"),
    hierarchical: str = Form("stacked"),
    color_precision: int = Form(6),
    filter_speckle: int = Form(4),
    # Curve-fitting quality knobs. Defaults favor smooth, faithful curves.
    corner_threshold: int = Form(60),
    length_threshold: float = Form(4.0),
    splice_threshold: int = Form(45),
    path_precision: int = Form(8),
    max_iterations: int = Form(10),
    layer_difference: int = Form(16),
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
            filter_speckle=int(_clamp(filter_speckle, 0, 64)),
            color_precision=int(_clamp(color_precision, 1, 8)),
            layer_difference=int(_clamp(layer_difference, 0, 256)),
            corner_threshold=int(_clamp(corner_threshold, 0, 180)),
            length_threshold=_clamp(length_threshold, 3.5, 10.0),
            splice_threshold=int(_clamp(splice_threshold, 0, 180)),
            path_precision=int(_clamp(path_precision, 1, 10)),
            max_iterations=int(_clamp(max_iterations, 1, 40)),
        )
    except Exception as error:  # noqa: BLE001 - surface a clean 500 to the client
        raise HTTPException(status_code=500, detail="Vectorization failed.") from error

    return Response(content=svg, media_type="image/svg+xml")
