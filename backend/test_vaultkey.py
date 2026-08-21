import os
import sys
import unittest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

class TestVaultKeySecurityWorkflow(unittest.TestCase):

    def test_full_security_journey(self):
        print("\n--- Starting End-to-End VaultKey Security Test ---")

        # 1. Register User
        email = "alice_test@vaultkey.app"
        password = "SecretPassword123!"

        reg_res = client.post("/api/auth/register", json={"email": email, "password": password})
        if reg_res.status_code == 400: # Already exists
            login_res = client.post("/api/auth/login", json={"email": email, "password": password})
            self.assertEqual(login_res.status_code, 200)
            token = login_res.json()["access_token"]
        else:
            self.assertEqual(reg_res.status_code, 200)
            token = reg_res.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}
        print("[OK] Authentication successful")

        # 2. Upload Encrypted PDF Ciphertext Payload
        dummy_ciphertext = b"%PDF-1.4 Mock Encrypted Ciphertext Payload Content Bytes"
        files = {
            "file": ("Project_Report.pdf.enc", dummy_ciphertext, "application/octet-stream")
        }
        data = {
            "original_filename": "Confidential_Project_Report.pdf",
            "iv_hex": "a1b2c3d4e5f6a7b8c9d0e1f2"
        }

        upload_res = client.post("/api/files", headers=headers, files=files, data=data)
        self.assertEqual(upload_res.status_code, 200)
        file_id = upload_res.json()["id"]
        print(f"[OK] Ciphertext uploaded successfully (File ID: {file_id})")

        # 3. Reject Non-PDF & Oversized Uploads
        bad_files = {
            "file": ("script.exe.enc", b"malicious binary", "application/octet-stream")
        }
        bad_data = {
            "original_filename": "malicious.exe",
            "iv_hex": "1234"
        }
        bad_upload_res = client.post("/api/files", headers=headers, files=bad_files, data=bad_data)
        self.assertEqual(bad_upload_res.status_code, 400)
        print("[OK] Non-PDF file rejection verified")

        # 4. Create Share Link (Max Downloads = 1, Expiration = 24h, Password = Protected123!)
        share_payload = {
            "file_id": file_id,
            "expiration_hours": 24,
            "max_downloads": 1,
            "password": "Protected123!"
        }
        share_res = client.post("/api/shares", headers=headers, json=share_payload)
        self.assertEqual(share_res.status_code, 200)
        share_data = share_res.json()
        raw_token = share_data["token"]
        share_id = share_data["share_id"]
        print(f"[OK] Share link created (Share ID: {share_id}, Token: {raw_token[:8]}...)")

        # 5. Public Recipient Access Check
        access_res = client.get(f"/api/access/{raw_token}")
        self.assertEqual(access_res.status_code, 200)
        check_info = access_res.json()
        self.assertTrue(check_info["valid"])
        self.assertTrue(check_info["requires_password"])
        self.assertEqual(check_info["downloads_remaining"], 1)
        print("[OK] Recipient access metadata check verified")

        # 6. Recipient Password Check - Incorrect Password
        auth_bad = client.post(f"/api/access/{raw_token}/authorize", json={"password": "WrongPassword"})
        self.assertEqual(auth_bad.status_code, 401)
        print("[OK] Incorrect password rejected (401)")

        # 7. Recipient Download - Valid Password
        download_res = client.post(f"/api/access/{raw_token}/download", json={"password": "Protected123!"})
        self.assertEqual(download_res.status_code, 200)
        self.assertEqual(download_res.headers["X-IV-Hex"], "a1b2c3d4e5f6a7b8c9d0e1f2")
        self.assertEqual(download_res.content, dummy_ciphertext)
        print("[OK] Encrypted ciphertext retrieved & IV header returned")

        # 8. Recipient Re-attempt Download (Limit Reached: Max 1)
        limit_res = client.post(f"/api/access/{raw_token}/download", json={"password": "Protected123!"})
        self.assertEqual(limit_res.status_code, 429)
        print("[OK] Download limit enforced (429 Limit Reached)")

        # 9. Create Second Share & Test Revocation
        share2_res = client.post("/api/shares", headers=headers, json={"file_id": file_id, "max_downloads": 5})
        raw_token2 = share2_res.json()["token"]
        share2_id = share2_res.json()["share_id"]

        # Owner Revokes Share Link
        revoke_res = client.post(f"/api/shares/{share2_id}/revoke", headers=headers)
        self.assertEqual(revoke_res.status_code, 200)
        print("[OK] Owner revoked share link successfully")

        # Recipient attempts revoked link
        revoked_access = client.get(f"/api/access/{raw_token2}")
        self.assertEqual(revoked_access.json()["status"], "REVOKED")
        self.assertFalse(revoked_access.json()["valid"])

        revoked_download = client.post(f"/api/access/{raw_token2}/download", json={})
        self.assertEqual(revoked_download.status_code, 403)
        print("[OK] Recipient access to revoked link denied (403 Revoked)")

        # 10. Test View-Only Share Link (max_downloads = 0)
        share_viewonly_res = client.post("/api/shares", headers=headers, json={"file_id": file_id, "max_downloads": 0})
        self.assertEqual(share_viewonly_res.status_code, 200)
        raw_token_view = share_viewonly_res.json()["token"]

        access_view_res = client.get(f"/api/access/{raw_token_view}")
        self.assertEqual(access_view_res.status_code, 200)
        self.assertTrue(access_view_res.json()["valid"])
        self.assertEqual(access_view_res.json()["max_downloads"], 0)

        # View encrypted file without triggering 429
        view_download_res = client.post(f"/api/access/{raw_token_view}/download", json={})
        self.assertEqual(view_download_res.status_code, 200)

        # 11. Audit Activity Log Check
        act_res = client.get(f"/api/activity?file_id={file_id}", headers=headers)
        self.assertEqual(act_res.status_code, 200)
        events = [a["event"] for a in act_res.json()]
        print(f"[OK] Security activity events logged: {events}")
        self.assertIn("LINK_CREATED", events)
        self.assertIn("FILE_DOWNLOADED", events)
        self.assertIn("FILE_VIEWED", events)
        self.assertIn("LINK_REVOKED", events)

        print("\n--- End-to-End VaultKey Security Test Passed 100% ---")



if __name__ == "__main__":
    unittest.main()
