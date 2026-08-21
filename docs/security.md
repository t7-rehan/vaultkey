# VaultKey Security & Compliance Guide

## Security Controls Checklist

- [x] **Web Crypto API**: Native browser AES-GCM 256-bit encryption.
- [x] **Zero-Knowledge Fragment Delivery**: Decryption key passed strictly via `#key=...`.
- [x] **PDF Validation**: Verified both by MIME type, extension, and `%PDF-` magic header bytes.
- [x] **Atomic Download Counter**: Race-condition-safe counter updates.
- [x] **Strict Size Limits**: 50 MB enforced in browser and FastAPI backend.
- [x] **Password Hashing**: PBKDF2/Bcrypt hash verification for protected shares.
- [x] **Audit Trail**: Every access attempt, download, revocation, and password failure logged.

## Defensive Terminology
VaultKey uses the term **Client-side encrypted file sharing**. It does not claim "100% unhackable", "DRM screenshot proof", or "Zero-knowledge server" unless qualified by the exact URL fragment key handling model described in the architecture documentation.
