# VaultKey Threat Model & Limitations

VaultKey is designed specifically to mitigate unauthorized access to sensitive shared documents after distribution.

---

## Threats Mitigated

1. **Database Breach**:
   - *Threat*: An attacker gains unauthorized read access to the database or storage bucket.
   - *Mitigation*: Storage contains only encrypted ciphertext blobs. Decryption keys are stored nowhere on the server or in database tables.

2. **Token Brute-Forcing**:
   - *Threat*: An attacker attempts to guess valid share links.
   - *Mitigation*: Tokens are generated using 32 bytes of cryptographically secure random entropy (`token_urlsafe(32)`). Shares are stored as SHA-256 hashes.

3. **Concurrent Download Limit Bypass**:
   - *Threat*: A recipient launches parallel automated requests to exceed max downloads.
   - *Mitigation*: Downloads execute inside an atomic database update statement (`UPDATE ... WHERE download_count < max_downloads`).

4. **Unauthorized Post-Share Access**:
   - *Threat*: A file owner needs to cut off access immediately after sharing.
   - *Mitigation*: Remote revocation instantly sets `revoked = True` on the server, blocking all subsequent ciphertext retrieval requests.

---

## Documented Security Limitations

1. **Revocation Limitations**: Revocation prevents **future access** to the file payload. It cannot delete or erase files already downloaded to a recipient's local hard drive or cache.
2. **Analog & Screen Capture**: VaultKey cannot prevent recipients from taking screenshots, filming the screen with a smartphone, or copying decrypted PDF content.
3. **Endpoint Security**: Client-side cryptography relies on the security of the browser environment. Malware or malicious browser extensions on the recipient machine could capture decrypted data.
4. **Metadata Exposure**: The backend sees file size, MIME type, upload timestamp, and original filename (stored for UI display).
