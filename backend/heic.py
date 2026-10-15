"""HEIC/HEIF → JPEG (or PNG) conversion with pillow-heif, for iPhone photos.

Browsers other than Safari can't decode HEIC, so the app sends HEIC files
here once, on import; every tool then works on the converted image. The color
profile (iPhones shoot in Display P3) and the EXIF data are kept — the
latter so "Strip metadata" can still show and remove it.
"""

from __future__ import annotations

import io

from pillow_heif import register_heif_opener

from images import decode_image

register_heif_opener()  # teaches Pillow to open HEIC/HEIF files

# Visually lossless for photos, and still much smaller than PNG.
JPEG_QUALITY = 95


def convert(data: bytes) -> tuple[bytes, str]:
    """Convert HEIC/HEIF bytes; returns ``(image_bytes, media_type)``."""
    image = decode_image(data)  # also applies (and clears) the EXIF orientation
    extras = {
        key: image.info[key] for key in ("exif", "icc_profile") if image.info.get(key)
    }

    buffer = io.BytesIO()
    if image.mode in ("RGBA", "LA"):
        image.save(buffer, format="PNG", **extras)
        return buffer.getvalue(), "image/png"
    image.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY, **extras)
    return buffer.getvalue(), "image/jpeg"
