# VaultKey — Share securely. Stay in control.

> Privacy-focused secure file-sharing application designed to give users granular control over sensitive files after they are shared.

VaultKey implements a complete end-to-end security workflow:
**UPLOAD → ENCRYPT → SHARE → CONTROL → MONITOR → REVOKE**

---

## Key Features

- **Client-Side Cryptography**: Files are encrypted in the browser using **256-bit AES-GCM** via the standard Web Crypto API before upload.
- **Zero-Knowledge Key Delivery**: The decryption key is embedded in the URL fragment (`/share/{token}#key={key_hex}`). URL fragments are never sent to the server over HTTP.
- **Server-Side Access Control**: FastAPI backend enforces token validation, expiration date, maximum download limits, and password verification.
- **Atomic Download Counter**: Atomic database updates prevent race conditions and limit bypasses.
- **Remote Revocation**: Owners can revoke share links instantly with one click, cutting off future access.
- **Audit Activity Timeline**: Chronological log of link creations, access attempts, downloads, password failures, and revocations.
- **Calm, Premium UI**: Modern interface with full Dark Mode support, built with React, Vite, and Tailwind CSS.

---

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Lucide React, Web Crypto API, React Router DOM.
- **Backend**: Python 3.14+, FastAPI, SQLAlchemy, Pydantic v2, Passlib (Bcrypt), Python-JOSE (JWT).
- **Database & Storage**: SQLite database (via SQLAlchemy) + Non-predictable ciphertext blob storage.

---

## Quick Start Guide

### 1. Start Python FastAPI Backend

```bash
cd backend
python run.py
```
The backend API server will start at `http://127.0.0.1:8000`.

### 2. Start React Frontend

```bash
cd frontend
npm run dev
```
The frontend dev server will start at `http://localhost:5173`.

---

## Complete Demo Flow Walkthrough

1. **Register/Login**: Register a new account (e.g. `alice@vaultkey.app`).
2. **Upload PDF**: Click **+ Upload PDF**. Select a PDF document (e.g., `Confidential_Project_Report.pdf`).
3. **Local Encryption**: Watch the browser perform 256-bit AES-GCM encryption before sending ciphertext to the backend.
4. **Configure Access Controls**: Set Expiration (e.g., 24 hours), Max Downloads (e.g., 1 download), and optional Password.
5. **Copy Share Link**: Copy the generated link format: `http://localhost:5173/share/<token>#key=<key_hex>`.
6. **Recipient Access**: Open the link in a private/incognito tab. The server verifies access parameters. Enter password if required.
7. **Client-Side Decryption**: The recipient browser retrieves ciphertext and decrypts it locally using `#key` from the URL fragment, triggering PDF download.
8. **Check Audit Log**: Return to Alice's dashboard/activity. View `ACCESS_GRANTED` and `FILE_DOWNLOADED` entries.
9. **Remote Revocation**: Alice clicks **REVOKE ACCESS**. Re-opening the recipient link now immediately displays `ACCESS REVOKED`.
