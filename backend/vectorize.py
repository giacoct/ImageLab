"""Raster → SVG tracing with VTracer (https://github.com/visioncortex/vtracer).

``preset="auto"`` analyzes each image and picks the tracing settings itself:
flat art (logos, illustrations) is upscaled and de-antialiased before tracing
so curves come out smooth and regions stay clean, while photo-like images get
noise suppression and harder layer merging. ``preset="manual"`` uses the
caller's settings instead.
"""

from __future__ import annotations

import vtracer
from PIL import Image, ImageFilter

from images import BadInputError, clamp, decode_image, encode_png

PRESETS = {"auto", "manual"}
MODES = {"spline", "polygon"}

# An image is "flat art" when its 12 most common colors cover most of a
# downsampled copy; anti-aliasing contributes many rare colors, so the
# threshold is well below 1.0.
FLAT_TOP_COLORS = 12
FLAT_COVERAGE = 0.85

# Flat art smaller than this is upscaled before tracing (smoother curves).
FLAT_UPSCALE_BELOW = 600
FLAT_TARGET_DIM = 1000

# VTracer settings shared by both presets (not exposed in the UI).
BASE_PARAMS = {
    "colormode": "color",
    "hierarchical": "stacked",
    "splice_threshold": 45,
    "max_iterations": 10,
}


def vectorize(
    data: bytes,
    *,
    preset: str,
    mode: str,
    color_precision: int,
    filter_speckle: int,
    corner_threshold: int,
    length_threshold: float,
) -> str:
    """Trace an uploaded image and return the SVG markup."""
    if preset not in PRESETS:
        raise BadInputError(f"Invalid preset: {preset!r}.")
    if mode not in MODES:
        raise BadInputError(f"Invalid mode: {mode!r}.")

    rgba = decode_image(data).convert("RGBA")
    if preset == "auto":
        return _trace_auto(rgba)

    params = {
        **BASE_PARAMS,
        "mode": mode,
        "filter_speckle": int(clamp(filter_speckle, 0, 64)),
        "color_precision": int(clamp(color_precision, 1, 8)),
        "layer_difference": 16,
        "corner_threshold": int(clamp(corner_threshold, 0, 180)),
        "length_threshold": clamp(length_threshold, 3.5, 10.0),
        "path_precision": 3,
    }
    return vtracer.convert_raw_image_to_svg(encode_png(rgba), img_format="png", **params)


def _trace_auto(rgba: Image.Image) -> str:
    """Analyze, preprocess, and trace the image with automatically chosen settings."""
    original_size = rgba.size
    max_dim = max(original_size)
    has_alpha = rgba.getextrema()[3][0] < 255
    flat = _is_flat_art(rgba)

    # Upscale small flat art with Lanczos so the tracer sees smooth,
    # large-scale edges instead of pixel steps. Photos are never upscaled —
    # that only multiplies noise regions.
    factor = 1
    if flat and max_dim < FLAT_UPSCALE_BELOW:
        factor = int(clamp(round(FLAT_TARGET_DIM / max_dim), 1, 4))

    work = rgba
    if factor > 1:
        work = work.resize((original_size[0] * factor, original_size[1] * factor), Image.LANCZOS)

    if flat and not has_alpha:
        # Flatten anti-aliasing into clean regions: a mode filter snaps each
        # pixel to its neighborhood majority (edges follow the smooth upscaled
        # curve), then quantization collapses the remaining stray colors.
        work = work.convert("RGB").filter(ImageFilter.ModeFilter(5))
        work = work.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
        work = work.convert("RGB")
    elif not flat:
        # Photos: a gentle median filter suppresses sensor noise and JPEG
        # artifacts that would otherwise trace into hundreds of tiny paths.
        work = work.convert("RGB").filter(ImageFilter.MedianFilter(3))

    params = {
        **BASE_PARAMS,
        "mode": "spline",
        # User testing favored strong speckle cleanup; scale it with the
        # upscale factor so it removes the same real-world detail size.
        "filter_speckle": int(clamp((8 * factor) if flat else 10, 0, 64)),
        "color_precision": 6,
        # Photos merge similar color layers harder to keep path counts sane.
        "layer_difference": 16 if flat else 28,
        "corner_threshold": 60,
        "length_threshold": 4.0,
        "path_precision": 2 if factor > 1 else 3,
    }
    svg = vtracer.convert_raw_image_to_svg(encode_png(work), img_format="png", **params)
    return _restore_dimensions(svg, original_size, work.size)


def _is_flat_art(rgba: Image.Image) -> bool:
    """Flat art (logo/illustration) vs photo-like, via color concentration."""
    thumb = rgba.convert("RGB")
    thumb.thumbnail((128, 128))
    colors = thumb.getcolors(maxcolors=4096)
    if colors is None:  # more than 4096 distinct colors: definitely photo-like
        return False

    counts = sorted((count for count, _ in colors), reverse=True)
    return sum(counts[:FLAT_TOP_COLORS]) / sum(counts) >= FLAT_COVERAGE


def _restore_dimensions(svg: str, original: tuple[int, int], traced: tuple[int, int]) -> str:
    """Present an upscaled trace at the original size via width/height + viewBox."""
    if original == traced:
        return svg
    return svg.replace(
        f'width="{traced[0]}" height="{traced[1]}"',
        f'width="{original[0]}" height="{original[1]}" viewBox="0 0 {traced[0]} {traced[1]}"',
        1,
    )
