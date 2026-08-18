# VaultKey Technical Architecture & Key Management Spec

VaultKey is built around a strict separation of **Server-Side Access Control** and **Client-Side Data Confidentiality**.

---

## 1. Key Management Architecture

```
Owner Browser (Upload)                          Recipient Browser (Download)
+-----------------------+                       +-----------------------+
| 1. Generate AES-GCM   |                       | 1. Parse #key=...     |
|    256-bit Key & IV   |                       |    (From URL Hash)    |
| 2. Encrypt PDF Buffer |                       | 2. Request Ciphertext |
| 3. Upload Ciphertext  |                       |    From FastAPI API   |
+-----------+-----------+                       +-----------+-----------+
            |                                               ^
            | (Ciphertext + IV)                             | (Returns Ciphertext)
            v                                               |
+-----------------------------------------------------------+-----------+
|                              FastAPI Backend                           |
| - Verifies Share Token Hash (SHA-256)                                 |
| - Enforces Server-Side Expiration, Password, & Max Download Limit      |
| - Performs Instant Remote Revocation Checks                            |
| - Never sees or receives the raw AES Decryption Key                    |
+-----------------------------------------------------------------------+
```

### URL Fragment Security (Zero-Knowledge Key Delivery)
When an owner generates a share link, VaultKey formats the URL as:
```
https://vaultkey.app/share/<raw_token>#key=<raw_256bit_hex_key>
```
1. **RFC 3986 Compliance**: According to the HTTP standard, browsers **NEVER** transmit URL fragments (`#key=...`) to web servers in HTTP request headers.
2. **Server Blindness**: The backend server receives only `<raw_token>`. It can authorize or deny the request, but even if the server is fully breached, it possesses zero plaintext decryption keys.

---

## 2. Server-Side Authorization Controls

Every recipient download request undergoes 5-layer server-side evaluation:
1. **Token Hash Existence**: Standard lookup of SHA-256 hash of token.
2. **Revocation State**: Checks `shares.revoked == False`.
3. **Expiration Timestamp**: Compares `shares.expires_at > UTC NOW()`.
4. **Atomic Download Counter**: Executes atomic SQL counter increment `UPDATE shares SET download_count = download_count + 1 WHERE download_count < max_downloads`. If zero rows are affected, access is denied.
5. **Password Verification**: Validates PBKDF2/Bcrypt hash if password protection is enabled.

---

## 3. Cryptographic Primitives

- **Algorithm**: AES-GCM (Galois/Counter Mode) with 256-bit key length.
- **Initialization Vector (IV)**: 96-bit (12-byte) cryptographically secure random value generated via `window.crypto.getRandomValues()`.
- **Browser API**: Standard `window.crypto.subtle` (Web Crypto API).
