"""4× AI super-resolution with Real-ESRGAN (realesr-general-x4v3) on CPU.

The model is an SRVGGNetCompact network exported to ONNX and run with OpenCV's
DNN module (onnxruntime has no wheels for our Python version; on this model
both give the same output). Unlike interpolation it reconstructs detail and
suppresses noise/JPEG artifacts. The weights are not in git:
``npm run setup`` downloads them into ``models/``.
"""

from __future__ import annotations

import threading
from pathlib import Path

import cv2
import numpy as np
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

# The network is expensive to load, so it is created on first use and shared.
# An OpenCV Net isn't safe to run from several threads at once, so the lock
# also serializes inference (it is CPU-bound anyway).
_net: cv2.dnn.Net | None = None
_net_lock = threading.Lock()


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
    with _net_lock:
        upscaled = _upscale_array(_get_net(), rgb)
    result = Image.fromarray((upscaled * 255.0 + 0.5).astype(np.uint8), mode="RGB")

    if has_alpha:
        # The model only sees RGB; carry transparency over by resampling the
        # alpha channel separately and recombining.
        alpha = image.convert("RGBA").getchannel("A")
        result = result.convert("RGBA")
        result.putalpha(alpha.resize((width * FACTOR, height * FACTOR), Image.LANCZOS))

    return encode_png(result)


def _get_net() -> cv2.dnn.Net:
    """The loaded network (call with ``_net_lock`` held)."""
    global _net
    if _net is None:
        if not MODEL_PATH.exists():
            raise MissingDependencyError(
                "The upscaler model is not installed on the server (run `npm run setup`)."
            )
        _net = cv2.dnn.readNetFromONNX(str(MODEL_PATH))
    return _net


def _run_model(net: cv2.dnn.Net, tile: np.ndarray) -> np.ndarray:
    """Run one HWC float32 [0,1] RGB tile through the model; return the 4× tile, clipped."""
    net.setInput(np.transpose(tile, (2, 0, 1))[None, ...].astype(np.float32))
    out = net.forward()
    return np.clip(np.transpose(np.squeeze(out, 0), (1, 2, 0)), 0.0, 1.0)


def _upscale_array(net: cv2.dnn.Net, img: np.ndarray) -> np.ndarray:
    """Upscale an HWC float32 [0,1] RGB array 4×, tiling large inputs."""
    height, width, _ = img.shape
    if max(height, width) <= TILE:
        return _run_model(net, img)

    out = np.zeros((height * FACTOR, width * FACTOR, 3), dtype=np.float32)
    for y0 in range(0, height, TILE):
        for x0 in range(0, width, TILE):
            x1, y1 = min(x0 + TILE, width), min(y0 + TILE, height)
            # Pad each tile so the model has context across the seam, then crop
            # the padding back out of the upscaled result.
            px0, py0 = max(x0 - TILE_PAD, 0), max(y0 - TILE_PAD, 0)
            px1, py1 = min(x1 + TILE_PAD, width), min(y1 + TILE_PAD, height)
            sr = _run_model(net, img[py0:py1, px0:px1, :])
            ox0, oy0 = (x0 - px0) * FACTOR, (y0 - py0) * FACTOR
            out[y0 * FACTOR : y1 * FACTOR, x0 * FACTOR : x1 * FACTOR, :] = sr[
                oy0 : oy0 + (y1 - y0) * FACTOR, ox0 : ox0 + (x1 - x0) * FACTOR, :
            ]
    return out
