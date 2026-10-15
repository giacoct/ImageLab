"""Text recognition with Tesseract (via pytesseract).

Returns the full text plus a pixel bounding box per word, which the app turns
into a selectable text layer over the image.
"""

from __future__ import annotations

import re

import pytesseract
from PIL import Image, ImageOps
from pytesseract import Output, TesseractError, TesseractNotFoundError

from images import BadInputError, MissingDependencyError, decode_image

# Tesseract language codes are 3-letter ISO 639-2 (optionally combined with
# '+', e.g. 'eng+ita'). Validated before being passed to the command line.
LANG_PATTERN = re.compile(r"^[a-z]{3}(\+[a-z]{3})*$")

# Drop words Tesseract is too unsure about — they're usually noise that would
# only clutter the selectable overlay.
MIN_WORD_CONFIDENCE = 30.0

# PSM 11 (sparse text) finds text anywhere on the image regardless of layout —
# better than the default PSM 3 for infographics, slides, and photos where
# there is no single dominant text block.
OCR_CONFIG = "--psm 11"


def recognize(data: bytes, lang: str) -> dict:
    """Recognize text and per-word boxes in uploaded image bytes.

    Returns ``{width, height, text, words}``; each word carries its pixel box,
    confidence, and the index of its text line (lines are in reading order).
    """
    if not LANG_PATTERN.match(lang):
        raise BadInputError(f"Invalid language code: {lang!r}.")

    image = decode_image(data).convert("RGB")
    width, height = image.size
    gray = image.convert("L")

    # Two passes over grayscale variants: the first captures dark-on-light text,
    # the second (inverted) captures light-on-dark text (e.g. white letters on a
    # coloured background). Overlapping detections are deduplicated by IoU so
    # words found in both passes appear only once.
    try:
        words = _dedup_words(_extract_words(gray, lang) + _extract_words(ImageOps.invert(gray), lang))
    except TesseractNotFoundError as error:
        raise MissingDependencyError("The OCR engine (Tesseract) is not installed on the server.") from error
    except TesseractError as error:
        # Almost always a language pack that isn't installed.
        raise BadInputError(f"OCR failed for language {lang!r}. Is the language pack installed?") from error

    lines = _group_lines(words)
    result_words = [
        {**word, "line": index} for index, line in enumerate(lines) for word in line
    ]
    text = "\n".join(" ".join(word["text"] for word in line) for line in lines)
    return {"width": width, "height": height, "text": text, "words": result_words}


def _extract_words(image: Image.Image, lang: str) -> list[dict]:
    """Run Tesseract on one image variant; return word-level detections."""
    fields = pytesseract.image_to_data(image, lang=lang, output_type=Output.DICT, config=OCR_CONFIG)
    words: list[dict] = []
    for i, raw_text in enumerate(fields["text"]):
        text = raw_text.strip()
        if not text or int(fields["level"][i]) != 5:  # level 5 = word
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
    kept: list[dict] = []
    for word in sorted(words, key=lambda w: w["confidence"], reverse=True):
        if not any(_iou(word, k) > threshold for k in kept):
            kept.append(word)
    return sorted(kept, key=lambda w: (w["top"], w["left"]))


def _group_lines(words: list[dict]) -> list[list[dict]]:
    """Group words (sorted top-to-bottom) into lines whose vertical spans overlap.

    Each line is returned sorted left-to-right.
    """
    lines: list[list[dict]] = []
    for word in words:
        center_y = word["top"] + word["height"] / 2
        line = next(
            (
                line
                for line in lines
                if min(w["top"] for w in line) <= center_y <= max(w["top"] + w["height"] for w in line)
            ),
            None,
        )
        if line is None:
            line = []
            lines.append(line)
        line.append(word)
    return [sorted(line, key=lambda w: w["left"]) for line in lines]
