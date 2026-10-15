"""Unit tests for the pure helpers in the processing modules."""

from __future__ import annotations

import ocr
import vectorize


def word(text: str, left: int, top: int, width: int = 10, height: int = 10, confidence: float = 90.0) -> dict:
    return {"text": text, "left": left, "top": top, "width": width, "height": height, "confidence": confidence}


def test_dedup_keeps_highest_confidence_per_location() -> None:
    dark = word("Hello", 0, 0, confidence=60.0)
    light = word("Hell0", 1, 0, confidence=95.0)
    other = word("World", 50, 0)
    kept = ocr._dedup_words([dark, light, other])
    assert [w["text"] for w in kept] == ["Hell0", "World"]


def test_group_lines_orders_words_left_to_right() -> None:
    words = [word("b", 30, 0), word("a", 0, 2), word("c", 0, 40)]
    lines = ocr._group_lines(sorted(words, key=lambda w: (w["top"], w["left"])))
    assert [[w["text"] for w in line] for line in lines] == [["a", "b"], ["c"]]


def test_restore_dimensions_adds_viewbox_for_upscaled_traces() -> None:
    svg = '<svg width="200" height="100">'
    restored = vectorize._restore_dimensions(svg, (100, 50), (200, 100))
    assert restored == '<svg width="100" height="50" viewBox="0 0 200 100">'
    assert vectorize._restore_dimensions(svg, (200, 100), (200, 100)) == svg
