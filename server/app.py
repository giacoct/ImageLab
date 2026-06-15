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
import re

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


# --- OCR --------------------------------------------------------------------

# Tesseract language codes are 3-letter ISO 639-2 (optionally combined with
# '+', e.g. 'eng+fra'). Validate before passing to the command line.
LANG_PATTERN = re.compile(r"^[a-z]{3}(\+[a-z]{3})*$")

# Drop words Tesseract is too unsure about — they're usually noise that would
# only clutter the selectable overlay.
MIN_WORD_CONFIDENCE = 30.0


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
    fields = pytesseract.image_to_data(image, lang=lang, output_type=Output.DICT)

    words: list[dict] = []
    lines: list[list[str]] = []
    # (block, paragraph, line) tuples map to a flat, ordered line index.
    line_index: dict[tuple[int, int, int], int] = {}

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

        key = (fields["block_num"][i], fields["par_num"][i], fields["line_num"][i])
        if key not in line_index:
            line_index[key] = len(lines)
            lines.append([])
        index = line_index[key]
        lines[index].append(text)

        words.append(
            {
                "text": text,
                "left": int(fields["left"][i]),
                "top": int(fields["top"][i]),
                "width": int(fields["width"][i]),
                "height": int(fields["height"][i]),
                "confidence": round(confidence, 1),
                "line": index,
            }
        )

    full_text = "\n".join(" ".join(line) for line in lines)
    return {"width": width, "height": height, "text": full_text, "words": words}


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
