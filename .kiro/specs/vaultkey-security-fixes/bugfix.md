# Bugfix Requirements Document

## Introduction

VaultKey is a privacy-focused, client-side encrypted file sharing application. A security and quality audit identified 10 issues across the backend and frontend spanning critical authentication vulnerabilities, missing rate limiting, insecure token storage, insufficient file validation, silent failure modes, and code quality gaps. This document captures the defective behaviors, the correct behaviors each fix must achieve, and the unchanged behaviors that must be preserved to prevent regressions.

---

## Bug Analysis

### Current Behavior (Defect)

**Issue 1 — Hardcoded JWT Secret Key**

1.1 WHEN the `JWT_SECRET` environment variable is not set THEN the system uses the hardcoded fallback string `"vaultkey_super_secret_jwt_key_2026_change_in_prod"` as the JWT signing secret, allowing any party with source code access to forge valid JWTs for arbitrary users.

**Issue 2 — CORS Wildcard Enabled**

1.2 WHEN any browser origin sends a credentialed request to the API THEN the system accepts it due to the `"*"` entry in the `origins` list, defeating the same-origin policy and exposing authenticated endpoints to cross-site request forgery from any domain.

**Issue 3 — No Rate Limiting on Auth or Access Endpoints**

1.3 WHEN an attacker sends unlimited requests to `POST /api/auth/login` THEN the system processes every attempt without throttling, enabling credential stuffing attacks.

1.4 WHEN an attacker sends unlimited requests to `POST /api/access/{token}/authorize` THEN the system processes every attempt without throttling, enabling brute-force of share link passwords.

1.5 WHEN an attacker sends unlimited requests to `POST /api/access/{token}/download` THEN the system processes every attempt without throttling.

1.6 WHEN an attacker sends unlimited requests to `POST /api/auth/register` THEN the system processes every attempt without throttling, enabling account enumeration and resource exhaustion.

**Issue 4 — JWT Stored in localStorage (XSS Risk)**

1.7 WHEN a cross-site scripting vulnerability is exploited in the frontend THEN the system exposes the JWT by storing it in `localStorage`, allowing the attacker to read `vaultkey_token` and impersonate the user for the full 7-day token lifetime.

**Issue 5 — No PDF Magic Bytes Validation Before Encryption**

1.8 WHEN a user selects a non-PDF file and renames it with a `.pdf` extension THEN the system encrypts and uploads it without validating the actual file content, bypassing the PDF-only restriction through filename spoofing.

**Issue 6 — 7-Day JWT with No Revocation Mechanism**

1.9 WHEN a JWT is issued THEN the system assigns a 7-day expiry with no server-side revocation capability, meaning a stolen or compromised token remains valid for up to 7 days with no way to invalidate it.

1.10 WHEN a user calls `POST /api/auth/logout` THEN no such endpoint exists; the token cannot be server-side invalidated.

**Issue 7 — Silent OSError on File Deletion**

1.11 WHEN `os.remove()` raises an `OSError` during file deletion THEN the system silently ignores the error with a bare `except OSError: pass`, leaving orphaned `.enc` blobs on disk with no operator visibility.

**Issue 8 — Inconsistent Audit Logging via Duplicated Inline Code**

1.12 WHEN any access event is logged THEN the system constructs `AccessLog` objects inline at each call site (10+ duplications), producing inconsistent field population and no guarantee that `ip_address`, `user_agent`, and other fields are recorded uniformly across all event types.

**Issue 9 — SQLite Not Suitable for Production**

1.13 WHEN multiple users make concurrent write requests THEN the system, if deployed with the default SQLite database, experiences single-writer locking contention and lacks connection pooling, making it unsuitable for production workloads. No documentation directs operators to configure `DATABASE_URL`.

**Issue 10 — Missing `__init__.py` in Routes Package**

1.14 WHEN Python tooling or older Python interpreters process the `backend/app/routes/` directory THEN the system relies on implicit namespace packages due to the absence of `__init__.py`, which is fragile across Python versions and static analysis tools.

---

### Expected Behavior (Correct)

**Issue 1 — Hardcoded JWT Secret Key**

2.1 WHEN the `JWT_SECRET` environment variable is not set at startup THEN the system SHALL raise a `RuntimeError` immediately, preventing the application from starting with an insecure fallback key.

**Issue 2 — CORS Wildcard Enabled**

2.2 WHEN the application starts THEN the system SHALL read allowed origins exclusively from the `ALLOWED_ORIGINS` environment variable and SHALL NOT include a wildcard `"*"` entry, so only explicitly configured origins are permitted.

**Issue 3 — No Rate Limiting on Auth or Access Endpoints**

2.3 WHEN more than 10 requests to `POST /api/auth/login` arrive from the same client within one minute THEN the system SHALL reject subsequent requests with HTTP 429 Too Many Requests until the window resets.

2.4 WHEN more than 10 requests to `POST /api/auth/register` arrive from the same client within one minute THEN the system SHALL reject subsequent requests with HTTP 429.

2.5 WHEN more than 5 requests to `POST /api/access/{token}/authorize` arrive from the same client within one minute THEN the system SHALL reject subsequent requests with HTTP 429.

2.6 WHEN more than 5 requests to `POST /api/access/{token}/download` arrive from the same client within one minute THEN the system SHALL reject subsequent requests with HTTP 429.

**Issue 4 — JWT Stored in localStorage (XSS Risk)**

2.7 WHEN a user successfully logs in or registers THEN the system SHALL deliver the JWT as an `httpOnly`, `Secure`, `SameSite=Strict` cookie set by the backend, and the frontend SHALL NOT store the token in `localStorage`.

2.8 WHEN the frontend makes authenticated API requests THEN the system SHALL rely on the browser automatically attaching the `httpOnly` cookie, with no manual token reads from `localStorage`.

**Issue 5 — No PDF Magic Bytes Validation Before Encryption**

2.9 WHEN `encryptFile()` is called with a file whose first 5 bytes are not `%PDF-` (hex: `25 50 44 46 2D`) THEN the system SHALL throw an error before any encryption occurs, rejecting the file as non-PDF regardless of its filename extension.

**Issue 6 — 7-Day JWT with No Revocation Mechanism**

2.10 WHEN a JWT is issued THEN the system SHALL set its expiry to 60 minutes and SHALL embed a unique `jti` (JWT ID) claim.

2.11 WHEN `POST /api/auth/logout` is called with a valid JWT THEN the system SHALL insert the token's `jti` into a `revoked_tokens` table, making it permanently invalid.

2.12 WHEN `get_current_user()` validates a JWT THEN the system SHALL check the `jti` against the `revoked_tokens` table and SHALL reject any token whose `jti` is present, returning HTTP 401.

**Issue 7 — Silent OSError on File Deletion**

2.13 WHEN `os.remove()` raises an `OSError` during file deletion THEN the system SHALL log the error using Python's `logging` module at `ERROR` level, including the file path and exception details, before continuing.

**Issue 8 — Inconsistent Audit Logging via Duplicated Inline Code**

2.14 WHEN any access event needs to be recorded THEN the system SHALL invoke a single `_log_event(db, share, event, status, request)` helper function that constructs and commits the `AccessLog` entry, ensuring all fields including `ip_address` and `user_agent` are consistently populated for every event type.

**Issue 9 — SQLite Not Suitable for Production**

2.15 WHEN an operator deploys VaultKey THEN the system SHALL provide a `.env.example` file that documents the `DATABASE_URL` variable with a PostgreSQL example value, and `database.py` SHALL contain a comment directing operators to configure this variable before production deployment.

**Issue 10 — Missing `__init__.py` in Routes Package**

2.16 WHEN Python imports the `backend/app/routes` package THEN the system SHALL resolve it as an explicit package due to the presence of `__init__.py`, ensuring consistent behavior across Python versions and tooling.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `JWT_SECRET` is correctly set as an environment variable THEN the system SHALL CONTINUE TO start normally and sign/verify JWTs using the configured secret.

3.2 WHEN an origin listed in `ALLOWED_ORIGINS` sends a request THEN the system SHALL CONTINUE TO accept it with the appropriate CORS headers.

3.3 WHEN authenticated requests arrive within the rate limit window THEN the system SHALL CONTINUE TO process them normally without interference.

3.4 WHEN a user logs in with valid credentials THEN the system SHALL CONTINUE TO authenticate the user and establish a valid session.

3.5 WHEN a user registers with a new email THEN the system SHALL CONTINUE TO create the account and return a valid session.

3.6 WHEN a valid share link token is accessed within its limits THEN the system SHALL CONTINUE TO serve the access check, authorization, and download flows correctly.

3.7 WHEN a genuine PDF file (with correct `%PDF-` magic bytes) is passed to `encryptFile()` THEN the system SHALL CONTINUE TO encrypt and return the ciphertext blob, IV hex, and key hex without error.

3.8 WHEN a valid, non-revoked JWT within its 60-minute window is presented THEN the system SHALL CONTINUE TO authenticate the request and return the current user.

3.9 WHEN a file deletion succeeds without error THEN the system SHALL CONTINUE TO delete the record from the database and return a success response.

3.10 WHEN access events are logged THEN the system SHALL CONTINUE TO record all existing event types (`ACCESS_DENIED`, `LINK_EXPIRED`, `ACCESS_ATTEMPT`, `PASSWORD_FAILED`, `ACCESS_GRANTED`, `FILE_DOWNLOADED`) with no loss of audit data.

3.11 WHEN the application starts with a correctly configured `DATABASE_URL` pointing to PostgreSQL THEN the system SHALL CONTINUE TO initialize the database schema and operate normally.

3.12 WHEN existing route modules (`auth`, `files`, `shares`, `access`, `activity`) are imported THEN the system SHALL CONTINUE TO register all routers correctly with no import errors.
