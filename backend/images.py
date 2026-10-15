"""Helpers shared by the processing modules (vectorize, ocr, upscale).

The processing modules know nothing about HTTP: they take raw image bytes and
raise one of the two errors below, which ``main.py`` maps to status codes.
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError


class BadInputError(Exception):
    """The request can't be processed as sent (HTTP 400). The message is shown to the user."""


class MissingDependencyError(Exception):
    """Something the server needs isn't installed (HTTP 503). The message is shown to the user."""


def decode_image(data: bytes) -> Image.Image:
    """Decode uploaded bytes into an upright PIL image (EXIF rotation applied)."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()  # force a full decode so truncated files fail here, not later
        return ImageOps.exif_transpose(image)
    except Image.DecompressionBombError as error:
        raise BadInputError("The image has too many pixels to process.") from error
    except (UnidentifiedImageError, OSError) as error:
        raise BadInputError("The image could not be decoded.") from error


def encode_png(image: Image.Image) -> bytes:
    """Serialize a PIL image as PNG bytes."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
