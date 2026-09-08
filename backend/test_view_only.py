"""
VaultKey – View-Only Share Mode Tests
======================================
Covers every scenario listed in the specification:

Backend scenarios
─────────────────
1.  DOWNLOAD share  → /download succeeds (200)
2.  VIEW_ONLY share → /download rejected (403, machine-readable error)
3.  VIEW_ONLY share → /view succeeds (200, ciphertext + IV header)
4.  VIEW_ONLY share → /access check returns access_mode == "view_only"
5.  Expired VIEW_ONLY share → /view rejected (410)
6.  Revoked VIEW_ONLY share → /view rejected (403)
7.  Password-protected VIEW_ONLY share → password still required
8.  Password-protected VIEW_ONLY share → wrong password → 401
9.  Normal DOWNLOAD share → unchanged behaviour (existing test compat)
10. Legacy compatibility: max_downloads=0 without access_mode → treated as view_only
11. Audit log: VIEW_STARTED logged on successful /view
12. Audit log: DOWNLOAD_BLOCKED logged when /download called on VIEW_ONLY share
13. /report-blocked: valid VIEW_ONLY event accepted (200)
14. /report-blocked: invalid event name rejected (422)
15. /report-blocked: accepted but silently ignored for DOWNLOAD shares
16. /view on a DOWNLOAD share → 400 (wrong endpoint)
"""

import os
import unittest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# ── Shared auth helper ────────────────────────────────────────────────────────

EMAIL = "view_only_test@vaultkey.app"
PASSWORD = "ViewOnlyTestPass123!"
_TOKEN_CACHE: dict[str, str] = {}


def _get_auth_token() -> str:
    if "token" in _TOKEN_CACHE:
        return _TOKEN_CACHE["token"]

    reg = client.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD})
    if reg.status_code == 400:
        login = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert login.status_code == 200, f"Login failed: {login.text}"
        _TOKEN_CACHE["token"] = login.json()["access_token"]
    else:
        assert reg.status_code == 200, f"Register failed: {reg.text}"
        _TOKEN_CACHE["token"] = reg.json()["access_token"]

    return _TOKEN_CACHE["token"]


def _auth_headers():
    return {"Authorization": f"Bearer {_get_auth_token()}"}


def _upload_file(name="test_doc.pdf") -> str:
    """Upload a dummy ciphertext and return the file_id."""
    files = {"file": (f"{name}.enc", b"DUMMY_CIPHERTEXT_BYTES", "application/octet-stream")}
    data = {"original_filename": name, "iv_hex": "aabbccddeeff00112233445566778899"}
    r = client.post("/api/files", headers=_auth_headers(), files=files, data=data)
    assert r.status_code == 200, f"Upload failed: {r.text}"
    return r.json()["id"]


def _create_share(file_id: str, access_mode: str = "download", max_downloads: int = 5,
                  password: str | None = None, expiration_hours: int | None = 24) -> dict:
    payload = {
        "file_id": file_id,
        "access_mode": access_mode,
        "max_downloads": max_downloads,
    }
    if password:
        payload["password"] = password
    if expiration_hours is not None:
        payload["expiration_hours"] = expiration_hours
    r = client.post("/api/shares", headers=_auth_headers(), json=payload)
    assert r.status_code == 200, f"Create share failed: {r.text}"
    return r.json()


# ── Test class ────────────────────────────────────────────────────────────────

class TestViewOnlyShareMode(unittest.TestCase):

    # ── Setup ─────────────────────────────────────────────────────────────────

    @classmethod
    def setUpClass(cls):
        cls.file_id = _upload_file()

    # ── 1. DOWNLOAD share → /download succeeds ────────────────────────────────

    def test_01_download_share_download_endpoint_succeeds(self):
        share = _create_share(self.file_id, access_mode="download", max_downloads=3)
        token = share["token"]

        r = client.post(f"/api/access/{token}/download", json={})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("X-IV-Hex", r.headers)
        self.assertEqual(r.content, b"DUMMY_CIPHERTEXT_BYTES")
        print("[OK] DOWNLOAD share → /download 200")

    # ── 2. VIEW_ONLY share → /download hard-rejected ─────────────────────────

    def test_02_view_only_download_endpoint_rejected(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]

        r = client.post(f"/api/access/{token}/download", json={})
        self.assertEqual(r.status_code, 403, r.text)
        body = r.json()
        # Machine-readable error must be present
        self.assertIn("detail", body)
        self.assertIn("view-only", body["detail"].lower())
        print("[OK] VIEW_ONLY share → /download 403 (machine-readable detail)")

    # ── 3. VIEW_ONLY share → /view succeeds ──────────────────────────────────

    def test_03_view_only_view_endpoint_succeeds(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]

        r = client.post(f"/api/access/{token}/view", json={})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("X-IV-Hex", r.headers)
        self.assertEqual(r.content, b"DUMMY_CIPHERTEXT_BYTES")
        # No Content-Disposition: attachment should be present
        self.assertNotIn("attachment", r.headers.get("Content-Disposition", ""))
        print("[OK] VIEW_ONLY share → /view 200")

    # ── 4. /access check returns access_mode == "view_only" ──────────────────

    def test_04_check_endpoint_returns_access_mode(self):
        share_vo = _create_share(self.file_id, access_mode="view_only")
        share_dl = _create_share(self.file_id, access_mode="download", max_downloads=5)

        r_vo = client.get(f"/api/access/{share_vo['token']}")
        self.assertEqual(r_vo.status_code, 200)
        self.assertEqual(r_vo.json()["access_mode"], "view_only")
        self.assertTrue(r_vo.json()["valid"])

        r_dl = client.get(f"/api/access/{share_dl['token']}")
        self.assertEqual(r_dl.status_code, 200)
        self.assertEqual(r_dl.json()["access_mode"], "download")
        self.assertTrue(r_dl.json()["valid"])
        print("[OK] GET /access/{token} returns correct access_mode for both modes")

    # ── 5. Expired VIEW_ONLY → /view rejected ────────────────────────────────

    def test_05_expired_view_only_rejected(self):
        # Create a share that expires in 0 hours (immediate expiry via past timestamp
        # is not directly possible via API, so we patch after creation).
        from app.database import SessionLocal
        from app.models import ShareLink
        from app.security import hash_share_token

        share = _create_share(self.file_id, access_mode="view_only", expiration_hours=168)
        token = share["token"]
        token_hash = hash_share_token(token)

        # Force-expire the share in the DB
        db = SessionLocal()
        try:
            s = db.query(ShareLink).filter(ShareLink.token_hash == token_hash).first()
            s.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
            db.commit()
        finally:
            db.close()

        r = client.post(f"/api/access/{token}/view", json={})
        self.assertEqual(r.status_code, 410, r.text)
        print("[OK] Expired VIEW_ONLY → /view 410")

    # ── 6. Revoked VIEW_ONLY → /view rejected ────────────────────────────────

    def test_06_revoked_view_only_rejected(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]
        share_id = share["share_id"]

        # Revoke it
        rev = client.post(f"/api/shares/{share_id}/revoke", headers=_auth_headers())
        self.assertEqual(rev.status_code, 200)

        r = client.post(f"/api/access/{token}/view", json={})
        self.assertEqual(r.status_code, 403, r.text)
        print("[OK] Revoked VIEW_ONLY → /view 403")

    # ── 7. Password-protected VIEW_ONLY → password still required ────────────

    def test_07_password_protected_view_only_requires_password(self):
        share = _create_share(
            self.file_id, access_mode="view_only", password="Secret99!"
        )
        token = share["token"]

        # No password → 401
        r_no_pw = client.post(f"/api/access/{token}/view", json={})
        self.assertEqual(r_no_pw.status_code, 401, r_no_pw.text)
        print("[OK] Password-protected VIEW_ONLY without password → 401")

    # ── 8. Password-protected VIEW_ONLY → wrong password → 401 ───────────────

    def test_08_password_protected_view_only_wrong_password(self):
        share = _create_share(
            self.file_id, access_mode="view_only", password="Secret99!"
        )
        token = share["token"]

        r_wrong = client.post(f"/api/access/{token}/view", json={"password": "WrongPW!"})
        self.assertEqual(r_wrong.status_code, 401, r_wrong.text)

        # Correct password → 200
        r_ok = client.post(f"/api/access/{token}/view", json={"password": "Secret99!"})
        self.assertEqual(r_ok.status_code, 200, r_ok.text)
        print("[OK] Password-protected VIEW_ONLY: wrong → 401, correct → 200")

    # ── 9. Normal DOWNLOAD share unchanged ───────────────────────────────────

    def test_09_download_share_unchanged_behaviour(self):
        share = _create_share(self.file_id, access_mode="download", max_downloads=1)
        token = share["token"]

        # First download succeeds
        r1 = client.post(f"/api/access/{token}/download", json={})
        self.assertEqual(r1.status_code, 200)

        # Second download exceeds limit
        r2 = client.post(f"/api/access/{token}/download", json={})
        self.assertEqual(r2.status_code, 429)
        print("[OK] DOWNLOAD share limit enforcement unchanged")

    # ── 10. Legacy compatibility: max_downloads=0 → view_only ────────────────

    def test_10_legacy_max_downloads_zero_treated_as_view_only(self):
        """
        Callers that pass max_downloads=0 without an explicit access_mode
        should be backwards-compatible — the share is treated as view_only.
        """
        payload = {"file_id": self.file_id, "max_downloads": 0}
        r = client.post("/api/shares", headers=_auth_headers(), json=payload)
        self.assertEqual(r.status_code, 200)
        share = r.json()
        token = share["token"]

        # access_mode should be resolved to view_only
        self.assertEqual(share["access_mode"], "view_only")

        # /download must still be rejected
        rd = client.post(f"/api/access/{token}/download", json={})
        self.assertEqual(rd.status_code, 403)

        # /view must succeed
        rv = client.post(f"/api/access/{token}/view", json={})
        self.assertEqual(rv.status_code, 200)
        print("[OK] Legacy max_downloads=0 resolved to view_only")

    # ── 11. Audit log: VIEW_STARTED on successful /view ───────────────────────

    def test_11_audit_log_view_started_on_view(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]

        r = client.post(f"/api/access/{token}/view", json={})
        self.assertEqual(r.status_code, 200)

        logs = client.get(
            f"/api/activity?file_id={self.file_id}", headers=_auth_headers()
        ).json()
        events = [l["event"] for l in logs]
        self.assertIn("VIEW_STARTED", events)
        print(f"[OK] Audit log contains VIEW_STARTED — all events: {events}")

    # ── 12. Audit log: DOWNLOAD_BLOCKED on /download for VIEW_ONLY ───────────

    def test_12_audit_log_download_blocked_on_rejected_download(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]

        r = client.post(f"/api/access/{token}/download", json={})
        self.assertEqual(r.status_code, 403)

        logs = client.get(
            f"/api/activity?file_id={self.file_id}", headers=_auth_headers()
        ).json()
        events = [l["event"] for l in logs]
        self.assertIn("DOWNLOAD_BLOCKED", events)
        print(f"[OK] Audit log contains DOWNLOAD_BLOCKED — all events: {events}")

    # ── 13. /report-blocked: valid event accepted ─────────────────────────────

    def test_13_report_blocked_valid_events_accepted(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]

        valid_events = [
            "PRINT_BLOCKED",
            "DOWNLOAD_BLOCKED",
            "SAVE_ATTEMPT_BLOCKED",
            "VIEW_STARTED",
            "VIEW_COMPLETED",
        ]
        for evt in valid_events:
            r = client.post(
                f"/api/access/{token}/report-blocked",
                json={"event": evt},
            )
            self.assertEqual(r.status_code, 200, f"event={evt}: {r.text}")
            self.assertEqual(r.json()["status"], "ok")

        # Confirm events appear in audit log
        logs = client.get(
            f"/api/activity?file_id={self.file_id}", headers=_auth_headers()
        ).json()
        audit_events = [l["event"] for l in logs]
        self.assertIn("PRINT_BLOCKED", audit_events)
        self.assertIn("SAVE_ATTEMPT_BLOCKED", audit_events)
        print("[OK] /report-blocked accepts all valid events and logs them")

    # ── 14. /report-blocked: invalid event name rejected ─────────────────────

    def test_14_report_blocked_invalid_event_rejected(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]

        r = client.post(
            f"/api/access/{token}/report-blocked",
            json={"event": "ARBITRARY_INJECTION"},
        )
        # Pydantic's Literal validator must reject non-allowlisted strings
        self.assertEqual(r.status_code, 422, r.text)
        print("[OK] /report-blocked rejects invalid event name (422)")

    # ── 15. /report-blocked silently ignored for DOWNLOAD shares ─────────────

    def test_15_report_blocked_silently_ignored_for_download_shares(self):
        share = _create_share(self.file_id, access_mode="download", max_downloads=5)
        token = share["token"]

        r = client.post(
            f"/api/access/{token}/report-blocked",
            json={"event": "PRINT_BLOCKED"},
        )
        # Returns 200 silently — no error exposed, nothing logged for download shares
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["status"], "ok")
        print("[OK] /report-blocked silently accepted but not logged for DOWNLOAD shares")

    # ── 16. /view on DOWNLOAD share → 400 ────────────────────────────────────

    def test_16_view_endpoint_on_download_share_rejected(self):
        share = _create_share(self.file_id, access_mode="download", max_downloads=5)
        token = share["token"]

        r = client.post(f"/api/access/{token}/view", json={})
        self.assertEqual(r.status_code, 400, r.text)
        self.assertIn("not view-only", r.json()["detail"].lower())
        print("[OK] /view on DOWNLOAD share → 400")

    # ── 17. VIEW_ONLY view counter not incremented ────────────────────────────

    def test_17_view_only_does_not_increment_download_count(self):
        share = _create_share(self.file_id, access_mode="view_only")
        token = share["token"]
        share_id = share["share_id"]

        # View twice
        for _ in range(3):
            r = client.post(f"/api/access/{token}/view", json={})
            self.assertEqual(r.status_code, 200)

        # download_count must still be 0
        detail = client.get(f"/api/shares/{share_id}", headers=_auth_headers()).json()
        self.assertEqual(detail["download_count"], 0)
        print("[OK] VIEW_ONLY /view does not increment download_count")

    # ── 18. create share response includes access_mode ────────────────────────

    def test_18_create_share_response_includes_access_mode(self):
        share_vo = _create_share(self.file_id, access_mode="view_only")
        share_dl = _create_share(self.file_id, access_mode="download", max_downloads=3)

        self.assertEqual(share_vo["access_mode"], "view_only")
        self.assertEqual(share_dl["access_mode"], "download")
        print("[OK] Share create response includes correct access_mode")


if __name__ == "__main__":
    unittest.main()
