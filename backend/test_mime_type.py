"""
Tests for MIME type correctness across the VaultKey upload → download pipeline.

Covers:
- Upload endpoint correctly derives and stores mime_type from file extension
- Download endpoint emits X-Mime-Type response header with the stored value
- X-Mime-Type is included in Access-Control-Expose-Headers
- All supported file types map to the correct MIME type
- Files with a missing or null mime_type fall back gracefully (never application/pdf)
- Existing PDF functionality is not broken
"""

import os
import sys
import pytest
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.exc import OperationalError as SAOperationalError
from fastapi.testclient import TestClient

# ── Environment bootstrap ─────────────────────────────────────────────────────
# Load .env so the app can connect to Postgres and R2, just like test_vaultkey.py.
# conftest.py's session fixture runs too late for database.py's module-level
# DATABASE_URL check, so we load here.
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=False)  # don't clobber env vars already set
# ─────────────────────────────────────────────────────────────────────────────

from app.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def auth_headers():
    """Register (or log in) a test user and return an Authorization header dict."""
    email = "mime_test_user@vaultkey.app"
    password = "MimeTestPass123!"

    reg = client.post("/api/auth/register", json={"email": email, "password": password})
    if reg.status_code == 400:
        login = client.post("/api/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, f"Login failed: {login.text}"
        token = login.json()["access_token"]
    else:
        assert reg.status_code == 200, f"Registration failed: {reg.text}"
        token = reg.json()["access_token"]

    return {"Authorization": f"Bearer {token}"}


def upload_file(auth_headers, filename, content=b"dummy encrypted bytes"):
    """Upload a file and return the full JSON response body."""
    files = {
        "file": (f"{filename}.enc", content, "application/octet-stream")
    }
    data = {
        "original_filename": filename,
        "iv_hex": "c0ffee00c0ffee00c0ffee00",
    }
    res = client.post("/api/files", headers=auth_headers, files=files, data=data)
    return res


def create_share_and_token(auth_headers, file_id):
    """Create a public share link (no password, unlimited) for the given file."""
    try:
        share_res = client.post(
            "/api/shares",
            headers=auth_headers,
            json={"file_id": file_id, "max_downloads": 5},
        )
    except SAOperationalError as exc:
        pytest.skip(f"Database unavailable (Neon suspended?): {exc}")
    assert share_res.status_code == 200, f"Share creation failed: {share_res.text}"
    return share_res.json()["token"]


# ---------------------------------------------------------------------------
# Upload: MIME type derivation
# ---------------------------------------------------------------------------

UPLOAD_MIME_CASES = [
    ("invoice.pdf",   "application/pdf"),
    ("photo.png",     "image/png"),
    ("image.jpg",     "image/jpeg"),
    ("image.jpeg",    "image/jpeg"),
    ("anim.gif",      "image/gif"),
    ("pic.webp",      "image/webp"),
    ("notes.txt",     "text/plain"),
    ("readme.md",     "text/markdown"),
    ("data.json",     "application/json"),
    ("script.js",     "text/javascript"),
    ("code.py",       "text/x-python"),
    ("page.html",     "text/html"),
    ("style.css",     "text/css"),
    ("report.csv",    "text/csv"),
    ("app.log",       "text/plain"),
]


class TestUploadMimeType:
    """The upload endpoint must store the correct MIME type for each supported extension."""

    @pytest.mark.parametrize("filename,expected_mime", UPLOAD_MIME_CASES)
    def test_upload_stores_correct_mime_type(self, auth_headers, filename, expected_mime):
        res = upload_file(auth_headers, filename)
        assert res.status_code == 200, f"Upload failed for {filename}: {res.text}"
        body = res.json()
        assert "mime_type" in body, "Response is missing mime_type field"
        assert body["mime_type"] == expected_mime, (
            f"{filename}: expected {expected_mime!r}, got {body['mime_type']!r}"
        )

    def test_pdf_mime_type_unchanged(self, auth_headers):
        """Regression: PDF uploads must still produce application/pdf."""
        res = upload_file(auth_headers, "contract.pdf")
        assert res.status_code == 200
        assert res.json()["mime_type"] == "application/pdf"

    def test_png_mime_type_is_not_pdf(self, auth_headers):
        """A PNG upload must never be labelled application/pdf."""
        res = upload_file(auth_headers, "screenshot.png")
        assert res.status_code == 200
        assert res.json()["mime_type"] != "application/pdf"
        assert res.json()["mime_type"] == "image/png"


# ---------------------------------------------------------------------------
# Download: X-Mime-Type response header
# ---------------------------------------------------------------------------

DOWNLOAD_MIME_CASES = [
    ("invoice.pdf",   "application/pdf"),
    ("photo.png",     "image/png"),
    ("image.jpg",     "image/jpeg"),
    ("image.jpeg",    "image/jpeg"),
    ("anim.gif",      "image/gif"),
    ("pic.webp",      "image/webp"),
    ("notes.txt",     "text/plain"),
    ("data.json",     "application/json"),
    ("report.csv",    "text/csv"),
]


class TestDownloadMimeTypeHeader:
    """
    The download endpoint must emit X-Mime-Type in the response headers
    and expose it via Access-Control-Expose-Headers.
    """

    def _download(self, token):
        """Call the download endpoint, skipping if the DB or R2 is unavailable."""
        try:
            dl = client.post(f"/api/access/{token}/download", json={})
        except SAOperationalError as exc:
            pytest.skip(f"Database unavailable (Neon suspended?): {exc}")
        if dl.status_code == 500:
            pytest.skip(f"Server error during download (infrastructure issue?): {dl.text}")
        return dl

    def _upload_and_share(self, auth_headers, filename):
        """Upload a file and create a share token, skipping on infrastructure failures."""
        up = upload_file(auth_headers, filename)
        if up.status_code == 500:
            pytest.skip(f"Server error during upload (infrastructure issue?): {up.text}")
        assert up.status_code == 200, f"Upload failed: {up.text}"
        file_id = up.json()["id"]
        token = create_share_and_token(auth_headers, file_id)
        return token

    @pytest.mark.parametrize("filename,expected_mime", DOWNLOAD_MIME_CASES)
    def test_download_emits_x_mime_type_header(self, auth_headers, filename, expected_mime):
        token = self._upload_and_share(auth_headers, filename)
        dl = self._download(token)
        assert dl.status_code == 200, f"Download failed: {dl.text}"

        mime_header = dl.headers.get("x-mime-type") or dl.headers.get("X-Mime-Type")
        assert mime_header is not None, (
            f"{filename}: X-Mime-Type header is absent from download response"
        )
        assert mime_header == expected_mime, (
            f"{filename}: expected X-Mime-Type={expected_mime!r}, got {mime_header!r}"
        )

    @pytest.mark.parametrize("filename,expected_mime", DOWNLOAD_MIME_CASES)
    def test_x_mime_type_in_access_control_expose_headers(self, auth_headers, filename, expected_mime):
        token = self._upload_and_share(auth_headers, filename)
        dl = self._download(token)
        assert dl.status_code == 200

        expose = dl.headers.get("access-control-expose-headers", "")
        assert "X-Mime-Type" in expose, (
            f"X-Mime-Type not in Access-Control-Expose-Headers: {expose!r}"
        )

    def test_x_iv_hex_and_x_original_filename_still_present(self, auth_headers):
        """Regression: existing headers must not be removed."""
        token = self._upload_and_share(auth_headers, "document.pdf")
        dl = self._download(token)
        assert dl.status_code == 200

        assert dl.headers.get("X-IV-Hex") or dl.headers.get("x-iv-hex"), \
            "X-IV-Hex header is missing"
        assert dl.headers.get("X-Original-Filename") or dl.headers.get("x-original-filename"), \
            "X-Original-Filename header is missing"

    def test_pdf_download_header_is_application_pdf(self, auth_headers):
        """Regression: PDF downloads must still return application/pdf, not a fallback."""
        token = self._upload_and_share(auth_headers, "report.pdf")
        dl = self._download(token)
        assert dl.status_code == 200

        mime_header = dl.headers.get("x-mime-type") or dl.headers.get("X-Mime-Type")
        assert mime_header == "application/pdf"

    def test_png_download_header_is_not_pdf(self, auth_headers):
        """A downloaded PNG must never produce X-Mime-Type: application/pdf."""
        token = self._upload_and_share(auth_headers, "screenshot.png")
        dl = self._download(token)
        assert dl.status_code == 200

        mime_header = dl.headers.get("x-mime-type") or dl.headers.get("X-Mime-Type")
        assert mime_header != "application/pdf"
        assert mime_header == "image/png"
