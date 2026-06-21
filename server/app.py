"""ImageLab vectorizer service.

A small FastAPI wrapper around VTracer (https://github.com/visioncortex/vtracer)
that converts an uploaded raster image into a compact, smooth color SVG and
returns it inline. The Angular app calls this through nginx at ``/api/vectorize``.

The default ``preset=auto`` analyzes each image and picks the tracing settings
itself: flat art (logos, illustrations) is upscaled and de-antialiased before
tracing so curves come out smooth and regions stay clean, while photo-like
images are traced more conservatively. ``preset=manual`` honors the individual
form parameters instead.
"""

from __future__ import annotations

import io
import os
import re
import threading

import numpy as np
import onnxruntime as ort
import pytesseract
import vtracer
from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
from pytesseract import Output, TesseractError, TesseractNotFoundError

app = FastAPI(title="ImageLab Vectorizer", version="1.2.0")

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

# --- auto-preset heuristics -------------------------------------------------

# An image is "flat art" when its 12 most common colors cover most of a
# downsampled copy; anti-aliasing contributes many rare colors, so the
# threshold is well below 1.0.
FLAT_TOP_COLORS = 12
FLAT_COVERAGE = 0.85

# Flat art smaller than this is upscaled before tracing (smoother curves).
FLAT_UPSCALE_BELOW = 600
FLAT_TARGET_DIM = 1000


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _is_flat_art(rgba: Image.Image) -> bool:
    """Flat art (logo/illustration) vs photo-like, via color concentration."""
    thumb = rgba.convert("RGB").copy()
    thumb.thumbnail((128, 128))
    colors = thumb.getcolors(maxcolors=4096)
    if colors is None:  # more than 4096 distinct colors: definitely photo-like
        return False

    counts = sorted((count for count, _ in colors), reverse=True)
    return sum(counts[:FLAT_TOP_COLORS]) / sum(counts) >= FLAT_COVERAGE


def _prepare_auto(data: bytes) -> tuple[bytes, dict, tuple[int, int], tuple[int, int]]:
    """Analyze + preprocess the upload for the auto preset.

    Returns ``(png_bytes, vtracer_params, original_size, traced_size)``.
    """
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        rgba = image.convert("RGBA")
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="The image could not be decoded.") from error

    original_size = rgba.size
    max_dim = max(original_size)
    has_alpha = rgba.getextrema()[3][0] < 255
    flat = _is_flat_art(rgba)

    # Upscale small flat art with Lanczos so the tracer sees smooth,
    # large-scale edges instead of pixel steps. Photos are never upscaled —
    # that only multiplies noise regions.
    factor = 1
    if flat and max_dim < FLAT_UPSCALE_BELOW:
        factor = int(_clamp(round(FLAT_TARGET_DIM / max_dim), 1, 4))

    work = rgba
    if factor > 1:
        work = work.resize((original_size[0] * factor, original_size[1] * factor), Image.LANCZOS)

    if flat and not has_alpha:
        # Flatten anti-aliasing into clean regions: a mode filter snaps each
        # pixel to its neighborhood majority (edges follow the smooth upscaled
        # curve), then quantization collapses the remaining stray colors.
        work = work.convert("RGB")
        work = work.filter(ImageFilter.ModeFilter(5))
        work = work.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
        work = work.convert("RGB")
    elif not flat:
        # Photos: a gentle median filter suppresses sensor noise and JPEG
        # artifacts that would otherwise trace into hundreds of tiny paths.
        work = work.convert("RGB").filter(ImageFilter.MedianFilter(3))

    buffer = io.BytesIO()
    work.save(buffer, format="PNG")

    params = {
        "colormode": "color",
        "hierarchical": "stacked",
        "mode": "spline",
        # User testing favored strong speckle cleanup; scale it with the
        # upscale factor so it removes the same real-world detail size.
        "filter_speckle": int(_clamp((8 * factor) if flat else 10, 0, 64)),
        "color_precision": 6,
        # Photos merge similar color layers harder to keep path counts sane.
        "layer_difference": 16 if flat else 28,
        "corner_threshold": 60,
        "length_threshold": 4.0,
        "splice_threshold": 45,
        "path_precision": 2 if factor > 1 else 3,
        "max_iterations": 10,
    }
    return buffer.getvalue(), params, original_size, work.size


def _restore_dimensions(svg: str, original: tuple[int, int], traced: tuple[int, int]) -> str:
    """Present an upscaled trace at the original size via width/height + viewBox."""
    if original == traced:
        return svg
    return svg.replace(
        f'width="{traced[0]}" height="{traced[1]}"',
        f'width="{original[0]}" height="{original[1]}" viewBox="0 0 {traced[0]} {traced[1]}"',
        1,
    )


@app.post("/vectorize")
async def vectorize(
    file: UploadFile,
    preset: str = Form("manual"),
    mode: str = Form("spline"),
    hierarchical: str = Form("stacked"),
    color_precision: int = Form(6),
    filter_speckle: int = Form(4),
    # Curve-fitting quality knobs. Defaults favor smooth, faithful curves.
    corner_threshold: int = Form(60),
    length_threshold: float = Form(4.0),
    splice_threshold: int = Form(45),
    path_precision: int = Form(3),
    max_iterations: int = Form(10),
    layer_difference: int = Form(16),
) -> Response:
    image_format = CONTENT_TYPE_TO_FORMAT.get((file.content_type or "").lower())
    if image_format is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPEG, or WebP.",
        )

    if preset not in {"auto", "manual"}:
        raise HTTPException(status_code=400, detail=f"Invalid preset: {preset!r}.")
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode!r}.")
    if hierarchical not in VALID_HIERARCHICAL:
        raise HTTPException(status_code=400, detail=f"Invalid hierarchical: {hierarchical!r}.")

    # Reject by declared size before reading the body into memory.
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    try:
        # Tracing is CPU-bound; run it off the event loop so concurrent
        # requests and /health keep responding while an image is traced.
        if preset == "auto":
            png, params, original_size, traced_size = await run_in_threadpool(
                _prepare_auto, data
            )
            svg = await run_in_threadpool(
                lambda: vtracer.convert_raw_image_to_svg(png, img_format="png", **params)
            )
            svg = _restore_dimensions(svg, original_size, traced_size)
        else:
            svg = await run_in_threadpool(
                lambda: vtracer.convert_raw_image_to_svg(
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
            )
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001 - surface a clean 500 to the client
        raise HTTPException(status_code=500, detail="Vectorization failed.") from error

    return Response(content=svg, media_type="image/svg+xml")


# --- AI upscaling -----------------------------------------------------------

# Real-ESRGAN (realesr-general-x4v3, an SRVGGNetCompact net) exported to ONNX.
# A learned 4x super-resolver: it reconstructs detail and suppresses noise/JPEG
# artifacts rather than interpolating. CPU-only inference via onnxruntime.
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
UPSCALE_MODEL_PATH = os.path.join(MODEL_DIR, "realesr-general-x4v3.onnx")
UPSCALE_FACTOR = 4

# Cap the input so a single 4x request stays bounded in time and memory on the
# CPU-only host (1500px in -> 6000px out).
MAX_UPSCALE_SIDE = 1500

# Process the image in overlapping tiles so peak memory is bounded regardless of
# input size; the padding is cropped off after upscaling to avoid seams.
UPSCALE_TILE = 256
UPSCALE_TILE_PAD = 16

# The ONNX session is expensive to build, so load it once and share it. A lock
# guards the first concurrent requests; afterwards reads are lock-free.
_upscale_session: ort.InferenceSession | None = None
_upscale_lock = threading.Lock()


def _get_upscale_session() -> ort.InferenceSession:
    global _upscale_session
    if _upscale_session is None:
        with _upscale_lock:
            if _upscale_session is None:
                if not os.path.exists(UPSCALE_MODEL_PATH):
                    raise HTTPException(
                        status_code=503,
                        detail="The upscaler model is not installed on the server.",
                    )
                _upscale_session = ort.InferenceSession(
                    UPSCALE_MODEL_PATH, providers=["CPUExecutionProvider"]
                )
    return _upscale_session


def _run_upscale_model(session: ort.InferenceSession, tile: np.ndarray) -> np.ndarray:
    """Run one HWC float32 [0,1] RGB tile through the model; return the 4x tile."""
    inp = np.transpose(tile, (2, 0, 1))[None, ...].astype(np.float32)
    out = session.run(None, {session.get_inputs()[0].name: inp})[0]
    return np.transpose(np.squeeze(out, 0), (1, 2, 0))


def _upscale_array(session: ort.InferenceSession, img: np.ndarray) -> np.ndarray:
    """Upscale an HWC float32 [0,1] RGB array 4x, tiling large inputs."""
    height, width, _ = img.shape
    if max(height, width) <= UPSCALE_TILE:
        return np.clip(_run_upscale_model(session, img), 0.0, 1.0)

    out = np.zeros((height * UPSCALE_FACTOR, width * UPSCALE_FACTOR, 3), dtype=np.float32)
    for y0 in range(0, height, UPSCALE_TILE):
        for x0 in range(0, width, UPSCALE_TILE):
            x1, y1 = min(x0 + UPSCALE_TILE, width), min(y0 + UPSCALE_TILE, height)
            # Pad each tile so the model has context across the seam, then crop
            # the padding back out of the upscaled result.
            px0, py0 = max(x0 - UPSCALE_TILE_PAD, 0), max(y0 - UPSCALE_TILE_PAD, 0)
            px1, py1 = min(x1 + UPSCALE_TILE_PAD, width), min(y1 + UPSCALE_TILE_PAD, height)
            sr = np.clip(_run_upscale_model(session, img[py0:py1, px0:px1, :]), 0.0, 1.0)
            ox0, oy0 = (x0 - px0) * UPSCALE_FACTOR, (y0 - py0) * UPSCALE_FACTOR
            out[y0 * UPSCALE_FACTOR : y1 * UPSCALE_FACTOR, x0 * UPSCALE_FACTOR : x1 * UPSCALE_FACTOR, :] = (
                sr[oy0 : oy0 + (y1 - y0) * UPSCALE_FACTOR, ox0 : ox0 + (x1 - x0) * UPSCALE_FACTOR, :]
            )
    return out


def _upscale_image(data: bytes) -> bytes:
    """Upscale raw image bytes 4x and return PNG bytes (the threadpool target)."""
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="The image could not be decoded.") from error

    width, height = image.size
    if max(width, height) > MAX_UPSCALE_SIDE:
        raise HTTPException(
            status_code=400,
            detail=f"Image is too large to upscale. The longest side must be at most {MAX_UPSCALE_SIDE}px.",
        )

    has_alpha = image.mode in ("RGBA", "LA") or (
        image.mode == "P" and "transparency" in image.info
    )

    arr = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    session = _get_upscale_session()
    sr = _upscale_array(session, arr)
    result = Image.fromarray((sr * 255.0 + 0.5).astype(np.uint8), mode="RGB")

    if has_alpha:
        # The model only sees RGB; carry transparency over by resampling the
        # alpha channel separately and recombining.
        alpha = image.convert("RGBA").getchannel("A")
        alpha_up = alpha.resize(
            (width * UPSCALE_FACTOR, height * UPSCALE_FACTOR), Image.LANCZOS
        )
        result = result.convert("RGBA")
        result.putalpha(alpha_up)

    buffer = io.BytesIO()
    result.save(buffer, format="PNG")
    return buffer.getvalue()


@app.post("/upscale")
async def upscale(file: UploadFile) -> Response:
    if file.content_type not in CONTENT_TYPE_TO_FORMAT:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPEG, or WebP.",
        )

    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    try:
        # Super-resolution is CPU-bound; keep it off the event loop like tracing
        # and OCR so /health and concurrent requests stay responsive.
        png = await run_in_threadpool(_upscale_image, data)
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001 - surface a clean 500 to the client
        raise HTTPException(status_code=500, detail="Upscaling failed.") from error

    return Response(content=png, media_type="image/png")


# --- OCR --------------------------------------------------------------------

# Tesseract language codes are 3-letter ISO 639-2 (optionally combined with
# '+', e.g. 'eng+fra'). Validate before passing to the command line.
LANG_PATTERN = re.compile(r"^[a-z]{3}(\+[a-z]{3})*$")

# Drop words Tesseract is too unsure about — they're usually noise that would
# only clutter the selectable overlay.
MIN_WORD_CONFIDENCE = 30.0

# PSM 11 (sparse text) finds text anywhere on the image regardless of layout —
# better than the default PSM 3 for infographics, slides, and photos where
# there is no single dominant text block.
OCR_CONFIG = "--psm 11"


def _extract_words(image: Image.Image, lang: str) -> list[dict]:
    """Run Tesseract on one image variant; return word-level detections."""
    fields = pytesseract.image_to_data(
        image, lang=lang, output_type=Output.DICT, config=OCR_CONFIG
    )
    words: list[dict] = []
    for i, raw_text in enumerate(fields["text"]):
        text = raw_text.strip()
        if not text or int(fields["level"][i]) != 5:
            continue
        try:
            confidence = float(fields["conf"][i])
        except (TypeError, ValueError):
            confidence = -1.0
        if confidence < MIN_WORD_CONFIDENCE:
            continue
        words.append(
            {
                "text": text,
                "left": int(fields["left"][i]),
                "top": int(fields["top"][i]),
                "width": int(fields["width"][i]),
                "height": int(fields["height"][i]),
                "confidence": round(confidence, 1),
            }
        )
    return words


def _iou(a: dict, b: dict) -> float:
    """Intersection-over-union of two pixel bounding boxes."""
    ix = max(0, min(a["left"] + a["width"], b["left"] + b["width"]) - max(a["left"], b["left"]))
    iy = max(0, min(a["top"] + a["height"], b["top"] + b["height"]) - max(a["top"], b["top"]))
    inter = ix * iy
    if inter == 0:
        return 0.0
    return inter / (a["width"] * a["height"] + b["width"] * b["height"] - inter)


def _dedup_words(words: list[dict], threshold: float = 0.5) -> list[dict]:
    """Merge detections from multiple passes; keep the highest-confidence hit per location."""
    by_conf = sorted(words, key=lambda w: w["confidence"], reverse=True)
    kept: list[dict] = []
    for word in by_conf:
        if not any(_iou(word, k) > threshold for k in kept):
            kept.append(word)
    return sorted(kept, key=lambda w: (w["top"], w["left"]))


def _run_ocr(data: bytes, lang: str) -> dict:
    """Recognize text and per-word boxes from raw image bytes.

    Returns ``{width, height, text, words}`` where each word carries its pixel
    bounding box, confidence, and the index of the text line it belongs to.
    Lines are numbered in reading order so the client can rebuild the layout.
    """
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="The image could not be decoded.") from error

    width, height = image.size
    gray = image.convert("L")

    # Two passes over grayscale variants: the first captures dark-on-light text,
    # the second (inverted) captures light-on-dark text (e.g. white letters on a
    # coloured background). Overlapping detections are deduplicated by IoU so
    # words found in both passes appear only once.
    words = _dedup_words(
        _extract_words(gray, lang) + _extract_words(ImageOps.invert(gray), lang)
    )

    # Assign line indices by grouping words whose vertical spans overlap.
    lines: list[list[dict]] = []
    for word in words:
        cy = word["top"] + word["height"] / 2
        matched = next(
            (
                li
                for li, line in enumerate(lines)
                if min(w["top"] for w in line) <= cy <= max(w["top"] + w["height"] for w in line)
            ),
            None,
        )
        if matched is None:
            matched = len(lines)
            lines.append([])
        lines[matched].append(word)

    result_words: list[dict] = []
    for li, line in enumerate(lines):
        for word in sorted(line, key=lambda w: w["left"]):
            result_words.append({**word, "line": li})

    full_text = "\n".join(
        " ".join(w["text"] for w in sorted(line, key=lambda w: w["left"])) for line in lines
    )
    return {"width": width, "height": height, "text": full_text, "words": result_words}


@app.post("/ocr")
async def ocr(file: UploadFile, lang: str = Form("eng")) -> JSONResponse:
    if file.content_type not in CONTENT_TYPE_TO_FORMAT:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPEG, or WebP.",
        )
    if not LANG_PATTERN.match(lang):
        raise HTTPException(status_code=400, detail=f"Invalid language code: {lang!r}.")

    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    try:
        # OCR is CPU-bound; keep it off the event loop like tracing.
        result = await run_in_threadpool(_run_ocr, data, lang)
    except HTTPException:
        raise
    except TesseractNotFoundError as error:  # tesseract binary not installed
        raise HTTPException(
            status_code=500,
            detail="The OCR engine is not installed on the server.",
        ) from error
    except TesseractError as error:
        # Most often a language pack that isn't installed.
        detail = f"OCR failed for language {lang!r}. Is the language pack installed?"
        raise HTTPException(status_code=400, detail=detail) from error
    except Exception as error:  # noqa: BLE001 - surface a clean 500 to the client
        raise HTTPException(status_code=500, detail="OCR failed.") from error

    return JSONResponse(content=result)
