"""4× AI super-resolution with Real-ESRGAN (realesr-general-x4v3) on CPU.

The model is an SRVGGNetCompact network exported to ONNX and run through
onnxruntime. Unlike interpolation it reconstructs detail and suppresses
noise/JPEG artifacts. The weights are not in git: ``npm run setup`` downloads
them into ``models/``.
"""

from __future__ import annotations

import threading
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from images import BadInputError, MissingDependencyError, decode_image, encode_png

MODEL_PATH = Path(__file__).resolve().parent / "models" / "realesr-general-x4v3.onnx"
FACTOR = 4

# Cap the input so a single request stays bounded in time and memory on a
# CPU-only host (1500 px in -> 6000 px out).
MAX_SIDE = 1500

# Process the image in overlapping tiles so peak memory is bounded regardless
# of input size; the padding is cropped off after upscaling to avoid seams.
TILE = 256
TILE_PAD = 16

# The ONNX session is expensive to build, so it is created on first use and
# shared. The lock only matters for the first concurrent requests.
_session: ort.InferenceSession | None = None
_session_lock = threading.Lock()


def upscale(data: bytes) -> bytes:
    """Upscale uploaded image bytes 4× and return PNG bytes (alpha is preserved)."""
    image = decode_image(data)
    width, height = image.size
    if max(width, height) > MAX_SIDE:
        raise BadInputError(
            f"Image is too large to upscale. The longest side must be at most {MAX_SIDE}px."
        )

    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)

    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    upscaled = _upscale_array(_get_session(), rgb)
    result = Image.fromarray((upscaled * 255.0 + 0.5).astype(np.uint8), mode="RGB")

    if has_alpha:
        # The model only sees RGB; carry transparency over by resampling the
        # alpha channel separately and recombining.
        alpha = image.convert("RGBA").getchannel("A")
        result = result.convert("RGBA")
        result.putalpha(alpha.resize((width * FACTOR, height * FACTOR), Image.LANCZOS))

    return encode_png(result)


def _get_session() -> ort.InferenceSession:
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                if not MODEL_PATH.exists():
                    raise MissingDependencyError(
                        "The upscaler model is not installed on the server (run `npm run setup`)."
                    )
                _session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    return _session


def _run_model(session: ort.InferenceSession, tile: np.ndarray) -> np.ndarray:
    """Run one HWC float32 [0,1] RGB tile through the model; return the 4× tile, clipped."""
    batch = np.transpose(tile, (2, 0, 1))[None, ...].astype(np.float32)
    out = session.run(None, {session.get_inputs()[0].name: batch})[0]
    return np.clip(np.transpose(np.squeeze(out, 0), (1, 2, 0)), 0.0, 1.0)


def _upscale_array(session: ort.InferenceSession, img: np.ndarray) -> np.ndarray:
    """Upscale an HWC float32 [0,1] RGB array 4×, tiling large inputs."""
    height, width, _ = img.shape
    if max(height, width) <= TILE:
        return _run_model(session, img)

    out = np.zeros((height * FACTOR, width * FACTOR, 3), dtype=np.float32)
    for y0 in range(0, height, TILE):
        for x0 in range(0, width, TILE):
            x1, y1 = min(x0 + TILE, width), min(y0 + TILE, height)
            # Pad each tile so the model has context across the seam, then crop
            # the padding back out of the upscaled result.
            px0, py0 = max(x0 - TILE_PAD, 0), max(y0 - TILE_PAD, 0)
            px1, py1 = min(x1 + TILE_PAD, width), min(y1 + TILE_PAD, height)
            sr = _run_model(session, img[py0:py1, px0:px1, :])
            ox0, oy0 = (x0 - px0) * FACTOR, (y0 - py0) * FACTOR
            out[y0 * FACTOR : y1 * FACTOR, x0 * FACTOR : x1 * FACTOR, :] = sr[
                oy0 : oy0 + (y1 - y0) * FACTOR, ox0 : ox0 + (x1 - x0) * FACTOR, :
            ]
    return out
