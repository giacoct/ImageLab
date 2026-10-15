"""HTTP-level tests: upload validation, error mapping, and serving the frontend."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main

client = TestClient(main.app)


def png_bytes(size: tuple[int, int] = (64, 64), color: str = "red") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def post_image(path: str, data: bytes, content_type: str = "image/png", **form: str):
    return client.post(path, files={"file": ("image.png", data, content_type)}, data=form)


def test_health() -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_rejects_unsupported_type() -> None:
    response = post_image("/api/upscale", b"GIF89a", content_type="image/gif")
    assert response.status_code == 400


def test_accepts_uppercase_content_type() -> None:
    response = post_image("/api/vectorize", png_bytes(), content_type="IMAGE/PNG", preset="auto")
    assert response.status_code == 200


def test_rejects_empty_upload() -> None:
    assert post_image("/api/ocr", b"").status_code == 400


def test_rejects_oversized_upload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 100)
    assert post_image("/api/ocr", png_bytes()).status_code == 413


def test_rejects_undecodable_image() -> None:
    response = post_image("/api/vectorize", b"not really a png", preset="auto")
    assert response.status_code == 400
    assert response.json()["detail"] == "The image could not be decoded."


@pytest.mark.parametrize("preset", ["auto", "manual"])
def test_vectorize_returns_svg(preset: str) -> None:
    response = post_image("/api/vectorize", png_bytes(), preset=preset)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml"
    assert response.text.lstrip().startswith("<?xml") or "<svg" in response.text


def test_vectorize_rejects_invalid_mode() -> None:
    assert post_image("/api/vectorize", png_bytes(), mode="bogus").status_code == 400


def test_ocr_rejects_invalid_language() -> None:
    response = post_image("/api/ocr", png_bytes(), lang="english; rm -rf /")
    assert response.status_code == 400


def test_upscale_rejects_large_images() -> None:
    response = post_image("/api/upscale", png_bytes((1600, 10)))
    assert response.status_code == 400
    assert "1500px" in response.json()["detail"]


def test_unknown_api_path_is_404() -> None:
    assert client.get("/api/nope").status_code == 404


def test_serves_frontend_with_spa_fallback(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "index.html").write_text("<app-root></app-root>")
    (tmp_path / "main-ABC123.js").write_text("console.log('app')")
    monkeypatch.setattr(main, "FRONTEND_DIR", tmp_path)

    assert client.get("/main-ABC123.js").text == "console.log('app')"
    deep_link = client.get("/tools/resize/settings")
    assert deep_link.text == "<app-root></app-root>"
    assert deep_link.headers["cache-control"] == "no-cache"
    # Path traversal never escapes the build folder.
    assert client.get("/..%2F..%2Fmain.py").text == "<app-root></app-root>"


def test_frontend_404_when_not_built(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "FRONTEND_DIR", tmp_path / "missing")
    assert client.get("/").status_code == 404
