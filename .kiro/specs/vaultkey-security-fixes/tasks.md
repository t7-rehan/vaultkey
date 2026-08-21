# Implementation Plan

- [ ] 1. Write bug condition exploration tests (BEFORE any fixes)
  - **Property 1: Bug Condition** - All 10 Security Issues Exposed on Unfixed Code
  - **CRITICAL**: These tests MUST FAIL (or confirm defects) on unfixed code — failure confirms each bug exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface concrete counterexamples that demonstrate every bug exists
  - **Scoped PBT Approach**: Scope each property to the concrete failing case(s) to ensure reproducibility

  Explore Issue 1 — Hardcoded JWT Secret:
  - Test that starting the application without `JWT_SECRET` set proceeds without error (server starts, no RuntimeError)
  - Verify `SECRET_KEY` equals the hardcoded fallback string `"vaultkey_super_secret_jwt_key_2026_change_in_prod"`
  - Document counterexample: application starts with insecure hardcoded key
  - _isBugCondition_1: env["JWT_SECRET"] is not set OR empty_

  Explore Issue 2 — CORS Wildcard:
  - Test that `"*"` is present in the `origins` list in `main.py`
  - Send a request from `http://evil.example.com` and verify it is accepted by CORS
  - Document counterexample: requests from arbitrary origins succeed
  - _isBugCondition_2: "*" IN origins_list_

  Explore Issue 3 — No Rate Limiting:
  - Send 20 consecutive `POST /api/auth/login` requests from the same IP
  - Verify all return 401 (wrong credentials) rather than 429 after the 10th
  - Document counterexample: unlimited requests reach the route handler
  - _isBugCondition_3: no_rate_limit_middleware_installed() AND request_count_in_window > LIMIT_FOR(endpoint)_

  Explore Issue 4 — JWT in localStorage:
  - Inspect `localStorage` after a successful login
  - Verify `localStorage.getItem('vaultkey_token')` returns the JWT string
  - Document counterexample: JWT is readable by JavaScript from localStorage
  - _isBugCondition_4: storage_mechanism == "localStorage"_

  Explore Issue 5 — No PDF Magic Bytes Validation:
  - Call `encryptFile()` with a `.jpg` file renamed to `.pdf`
  - Verify encryption proceeds and no error is thrown
  - Document counterexample: non-PDF content is encrypted without rejection
  - _isBugCondition_5: first 5 bytes != [0x25,0x50,0x44,0x46,0x2D] AND filename ends with ".pdf"_

  Explore Issue 6 — 7-Day JWT with No Revocation:
  - Decode a freshly issued JWT and verify `exp - iat == 604800` (7 days) and no `jti` claim is present
  - Verify that calling `POST /api/auth/logout` does not invalidate the token server-side
  - Document counterexample: tokens live 7 days, cannot be revoked
  - _isBugCondition_6: token.exp - token.iat > 3600 OR no revoked_tokens table OR token.jti absent_

  Explore Issue 7 — Silent OSError:
  - Mock `os.remove` to raise `OSError`, then call `DELETE /api/files/{id}`
  - Verify a 200 is returned with no log output at ERROR level
  - Document counterexample: silent swallowing of filesystem errors
  - _isBugCondition_7: os.remove() raises OSError AND handler is "except OSError: pass"_

  Explore Issue 8 — Inconsistent Audit Logging:
  - Review `access.py` source; count `db.add(AccessLog(` occurrences
  - Verify 10+ inline duplications exist with inconsistent field population
  - Document counterexample: `ip_address` or `user_agent` missing from at least one call site
  - _isBugCondition_8: AccessLog constructed inline at call site AND no shared helper function_

  Explore Issue 9 — SQLite Production Docs:
  - Check that `backend/.env.example` does not exist
  - Verify `database.py` contains no operator guidance comment for `DATABASE_URL`
  - Document counterexample: operator deploying without guidance defaults to SQLite in production
  - _isBugCondition_9: DATABASE_URL defaults to SQLite AND no .env.example AND no operator guidance_

  Explore Issue 10 — Missing `__init__.py`:
  - Check that `backend/app/routes/__init__.py` does not exist
  - Verify that static analysis tools flag the directory as a namespace package
  - Document counterexample: routes package resolved as namespace package rather than explicit package
  - _isBugCondition_10: __init__.py does not exist in backend/app/routes/_

  - Run all exploration checks on UNFIXED code
  - **EXPECTED OUTCOME**: All 10 defects confirmed; document each counterexample found
  - Mark task complete when all checks are written, run, and failures/defects are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14_

- [ ] 2. Write preservation property tests (BEFORE implementing any fix)
  - **Property 2: Preservation** - All Existing Correct Behaviors Captured on Unfixed Code
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code, observe outputs, then codify them
  - **GOAL**: Establish a regression baseline that all fixes must satisfy

  Observe and encode preservation for valid JWT secret startup (3.1):
  - With `JWT_SECRET` set to a valid value, start the application and verify it starts normally
  - Write property: for all non-empty `JWT_SECRET` values, application starts without RuntimeError

  Observe and encode preservation for CORS allowed origins (3.2):
  - With `origins = ["http://localhost:5173"]` (no wildcard), verify listed origin receives CORS headers
  - Write property: for all origins in the configured allow-list, CORS headers are present in responses

  Observe and encode preservation for within-rate-limit requests (3.3):
  - Send 5 requests from the same IP to `/api/auth/login` and verify all are processed (return 401 for bad creds, not 429)
  - Write property: for all request counts ≤ limit, responses are non-429

  Observe and encode preservation for valid login (3.4):
  - `POST /api/auth/login` with correct email and password → 200, user object returned
  - Write example test: valid credentials always authenticate successfully

  Observe and encode preservation for registration (3.5):
  - `POST /api/auth/register` with a new email → 200, user created
  - Write example test: new email registration always creates account

  Observe and encode preservation for valid share link flows (3.6):
  - Full flow: check → authorize → download with valid token → encrypted blob returned with X-IV-Hex and X-Original-Filename headers
  - Write example test: non-revoked, non-expired share links with remaining downloads serve files correctly

  Observe and encode preservation for genuine PDF encryption (3.7):
  - Call `encryptFile(realPdfFile)` where file starts with `%PDF-`
  - Observe: returns `{ encryptedBlob, ivHex, keyHex }` without error
  - Write property: for all files whose first 5 bytes are `%PDF-`, encryptFile always succeeds

  Observe and encode preservation for authenticated API calls (3.8):
  - `GET /api/auth/me` with a valid JWT → returns user object
  - Write example test: valid non-revoked tokens within their window authenticate successfully

  Observe and encode preservation for file deletion success (3.9):
  - `DELETE /api/files/{id}` where file exists on disk → 200, DB record removed
  - Write example test: successful deletion returns success response with no logger error call

  Observe and encode preservation for audit log completeness (3.10):
  - Trigger `ACCESS_DENIED`, `LINK_EXPIRED`, `ACCESS_ATTEMPT`, `PASSWORD_FAILED`, `ACCESS_GRANTED`, `FILE_DOWNLOADED` events
  - Verify every resulting `AccessLog` record has non-null `event`, `status`, `share_id`, `file_id`, `owner_id`
  - Write property: for all event types, AccessLog records are complete

  Observe and encode preservation for route imports (3.12):
  - Import all 5 routers (`auth`, `files`, `shares`, `access`, `activity`) programmatically
  - Verify no ImportError is raised

  - Run all preservation tests on UNFIXED code
  - **EXPECTED OUTCOME**: All preservation tests PASS (establishes baseline to protect)
  - Mark task complete when all tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [ ] 3. Fix Issue 1 — Hardcoded JWT Secret Key [CRITICAL]

  - [ ] 3.1 Remove hardcoded fallback and add startup guard in `security.py`
    - Change `SECRET_KEY = os.environ.get("JWT_SECRET", "vaultkey_super_secret_jwt_key_2026_change_in_prod")` to `SECRET_KEY = os.environ.get("JWT_SECRET")`
    - Immediately after the assignment, add: `if not SECRET_KEY: raise RuntimeError("JWT_SECRET environment variable must be set before starting the application.")`
    - _Bug_Condition: isBugCondition_1(env) — env["JWT_SECRET"] is not set or empty_
    - _Expected_Behavior: RuntimeError raised at module import time; server does not start_
    - _Preservation: When JWT_SECRET is set, app starts normally and signs/verifies JWTs with configured secret_
    - _Requirements: 2.1, 3.1_

  - [ ] 3.2 Verify bug condition exploration test now passes for Issue 1
    - **Property 1: Expected Behavior** - Startup Fails Without JWT Secret
    - **IMPORTANT**: Re-run the SAME test from task 1 (Issue 1 exploration) — do NOT write a new test
    - Start the application without `JWT_SECRET`; confirm `RuntimeError` is raised and server does not start
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1_

  - [ ] 3.3 Verify preservation tests still pass after Issue 1 fix
    - **Property 2: Preservation** - Valid JWT Secret Startup Still Works
    - **IMPORTANT**: Re-run the SAME tests from task 2 (3.1 preservation) — do NOT write new tests
    - Confirm app starts normally when `JWT_SECRET` is set to a non-empty value
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 4. Fix Issue 2 — CORS Wildcard Enabled [CRITICAL]

  - [ ] 4.1 Replace hard-coded origins list with environment-driven configuration in `main.py`
    - Add `import os` at the top if not already present
    - Replace the `origins = [...]` list with: `origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")`
    - Remove `"*"` entirely; no wildcard entry must remain
    - _Bug_Condition: isBugCondition_2(origins_list) — "*" IN origins_list_
    - _Expected_Behavior: CORS rejects any origin not in ALLOWED_ORIGINS; wildcard absent_
    - _Preservation: Origins listed in ALLOWED_ORIGINS continue to receive correct CORS headers_
    - _Requirements: 2.2, 3.2_

  - [ ] 4.2 Verify bug condition exploration test now passes for Issue 2
    - **Property 1: Expected Behavior** - CORS Rejects Unconfigured Origins
    - Re-run the Issue 2 exploration from task 1; confirm request from `http://evil.example.com` is rejected
    - Verify `"*"` is no longer in the origins list
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.2_

  - [ ] 4.3 Verify preservation tests still pass after Issue 2 fix
    - **Property 2: Preservation** - Allowed Origins Still Pass CORS
    - Re-run the 3.2 preservation tests from task 2
    - Confirm `http://localhost:5173` continues to receive `Access-Control-Allow-Origin` headers
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 5. Fix Issue 3 — No Rate Limiting on Auth and Access Endpoints [HIGH]

  - [ ] 5.1 Add `slowapi` and `limits` to `requirements.txt`
    - Append `slowapi>=0.1.9` and `limits>=3.6.0` to `backend/requirements.txt`
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ] 5.2 Configure `slowapi` limiter in `main.py`
    - Import `Limiter`, `get_remote_address`, `RateLimitExceeded`, `_rate_limit_exceeded_handler` from `slowapi`
    - Import `SlowAPIMiddleware` from `slowapi.middleware`
    - Instantiate `limiter = Limiter(key_func=get_remote_address)` at module level
    - Assign `app.state.limiter = limiter` after app creation
    - Register exception handler: `app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)`
    - Add `app.add_middleware(SlowAPIMiddleware)`
    - _Bug_Condition: isBugCondition_3 — no_rate_limit_middleware_installed()_
    - _Expected_Behavior: HTTP 429 returned when per-endpoint limit is exceeded_
    - _Preservation: Requests within the rate limit window continue to be processed normally_
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.3_

  - [ ] 5.3 Apply rate limits to auth endpoints in `routes/auth.py`
    - Import `limiter` from `..main` (or a shared `limiter` module) and `Request` from `fastapi`
    - Add `request: Request` parameter to `register_user` and `login_user` handlers (required by slowapi)
    - Decorate `register_user` with `@limiter.limit("10/minute")`
    - Decorate `login_user` with `@limiter.limit("10/minute")`
    - _Requirements: 2.3, 2.4_

  - [ ] 5.4 Apply rate limits to access endpoints in `routes/access.py`
    - Import `limiter` and ensure `Request` is already imported
    - Decorate `authorize_password` with `@limiter.limit("5/minute")`
    - Decorate `download_encrypted_file` with `@limiter.limit("5/minute")`
    - _Requirements: 2.5, 2.6_

  - [ ] 5.5 Verify bug condition exploration test now passes for Issue 3
    - **Property 1: Expected Behavior** - Rate Limits Enforced on Auth and Access Endpoints
    - Re-run the Issue 3 explorations from task 1
    - Send 11 login requests: verify the 11th returns HTTP 429
    - Send 6 authorize requests: verify the 6th returns HTTP 429
    - **EXPECTED OUTCOME**: Tests PASS (confirms bug is fixed)
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ] 5.6 Verify preservation tests still pass after Issue 3 fix
    - **Property 2: Preservation** - Within-Limit Requests Still Processed
    - Re-run the 3.3 preservation tests from task 2
    - Send 5 login requests; confirm all return non-429 responses
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 6. Fix Issue 4 — JWT Stored in localStorage [HIGH]

  - [ ] 6.1 Switch to httpOnly cookie delivery in `routes/auth.py`
    - Import `Response`, `Cookie` from `fastapi` and `Optional` from `typing`
    - Add `response: Response` parameter to `register_user` and `login_user`
    - After creating `access_token`, call `response.set_cookie(key="vaultkey_session", value=access_token, httponly=True, secure=True, samesite="strict", max_age=3600)`
    - Add `POST /api/auth/logout` endpoint that clears the cookie via `response.delete_cookie("vaultkey_session")` (full implementation with jti revocation is done in task 8.2)
    - _Bug_Condition: isBugCondition_4 — storage_mechanism == "localStorage"_
    - _Expected_Behavior: JWT delivered as httpOnly Secure SameSite=Strict cookie; token absent from JSON body_
    - _Preservation: Valid credentials continue to authenticate; user object still returned_
    - _Requirements: 2.7, 3.4, 3.5_

  - [ ] 6.2 Replace `OAuth2PasswordBearer` with Cookie-based dependency in `security.py`
    - Import `Cookie` from `fastapi`
    - Replace `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")` with a Cookie-based dependency
    - Update `get_current_user` signature to `def get_current_user(vaultkey_session: Optional[str] = Cookie(default=None), db: Session = Depends(get_db))`
    - If `vaultkey_session` is None, raise `credentials_exception`
    - Use `vaultkey_session` as the token in the existing JWT decode logic
    - _Requirements: 2.8, 3.8_

  - [ ] 6.3 Remove localStorage token reads and add `credentials: "include"` in `frontend/src/services/api.js`
    - Remove `const token = localStorage.getItem('vaultkey_token')` and the `Authorization` header injection block
    - Add `credentials: "include"` to the `fetch` options so the browser sends the `httpOnly` cookie automatically
    - _Requirements: 2.8_

  - [ ] 6.4 Remove localStorage token writes in `frontend/src/services/authService.js`
    - Remove `localStorage.setItem('vaultkey_token', data.access_token)` from `loginUser` and `registerUser`
    - Remove `localStorage.removeItem('vaultkey_token')` from `logoutUser`
    - Update `logoutUser` to be async and call `POST /api/auth/logout` to clear the server-side cookie
    - _Requirements: 2.7, 2.8_

  - [ ] 6.5 Update `AuthContext.jsx` to remove localStorage token guards
    - Remove `const token = localStorage.getItem('vaultkey_token')` from the initialization `useEffect`
    - Replace the token guard with a direct `getCurrentUser()` call (cookie is sent automatically if present)
    - Update `logout` to `await logoutUser()` (now async)
    - _Requirements: 2.7, 2.8_

  - [ ] 6.6 Verify bug condition exploration test now passes for Issue 4
    - **Property 1: Expected Behavior** - JWT Delivered as httpOnly Cookie
    - Re-run the Issue 4 exploration from task 1
    - Inspect response after login: verify `Set-Cookie: vaultkey_session=...; HttpOnly; Secure; SameSite=Strict` header is present
    - Verify `localStorage.getItem('vaultkey_token')` returns null
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.7, 2.8_

  - [ ] 6.7 Verify preservation tests still pass after Issue 4 fix
    - **Property 2: Preservation** - Authentication Flows Still Work
    - Re-run the 3.4, 3.5, 3.8 preservation tests from task 2
    - Confirm login returns user object, registration creates account, `/api/auth/me` with cookie returns user
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 7. Fix Issue 5 — No PDF Magic Bytes Validation [MEDIUM]

  - [ ] 7.1 Add magic bytes check to `encryptFile()` in `frontend/src/crypto/encrypt.js`
    - After `const fileBuffer = await file.arrayBuffer();` (after the `onProgress(30)` line), add:
      ```javascript
      const header = new Uint8Array(fileBuffer.slice(0, 5));
      const magic = String.fromCharCode(...header);
      if (!magic.startsWith('%PDF-')) {
        throw new Error('Invalid file: not a PDF document.');
      }
      ```
    - Ensure the check runs before any key generation or encryption (`generateKey`, `encrypt`) is called
    - _Bug_Condition: isBugCondition_5 — first 5 bytes != [0x25,0x50,0x44,0x46,0x2D] AND filename ends ".pdf"_
    - _Expected_Behavior: Error("Invalid file: not a PDF document.") thrown before any crypto operations_
    - _Preservation: Genuine PDF files (starting with %PDF-) continue to encrypt and return encryptedBlob, ivHex, keyHex_
    - _Requirements: 2.9, 3.7_

  - [ ] 7.2 Verify bug condition exploration test now passes for Issue 5
    - **Property 1: Expected Behavior** - Non-PDF Files Rejected Before Encryption
    - Re-run the Issue 5 exploration from task 1 (call `encryptFile` with renamed `.jpg`)
    - Verify `Error("Invalid file: not a PDF document.")` is thrown and no `CryptoKey` is generated
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.9_

  - [ ] 7.3 Verify preservation tests still pass after Issue 5 fix
    - **Property 2: Preservation** - Genuine PDFs Still Encrypt Successfully
    - Re-run the 3.7 preservation tests from task 2
    - Confirm `encryptFile(realPdfFile)` returns `{ encryptedBlob, ivHex, keyHex }` without error
    - Write property-based test: for all byte arrays where `header == "%PDF-"`, `encryptFile` always succeeds
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 8. Fix Issue 6 — 7-Day JWT with No Revocation [MEDIUM]

  - [ ] 8.1 Add `RevokedToken` model to `backend/app/models.py`
    - Add new SQLAlchemy model:
      ```python
      class RevokedToken(Base):
          __tablename__ = "revoked_tokens"
          id = Column(String(36), primary_key=True, default=generate_uuid)
          jti = Column(String(36), unique=True, nullable=False, index=True)
          revoked_at = Column(DateTime, default=datetime.utcnow)
      ```
    - _Requirements: 2.11_

  - [ ] 8.2 Reduce JWT lifetime and embed `jti` in `security.py`
    - Add `import uuid` at the top
    - Change `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7` to `ACCESS_TOKEN_EXPIRE_MINUTES = 60`
    - In `create_access_token()`, add `to_encode["jti"] = str(uuid.uuid4())` before `jwt.encode()`
    - In `get_current_user()`, after decoding the payload:
      - Extract `jti = payload.get("jti")`
      - If `jti is None`, raise `credentials_exception`
      - Query `db.query(RevokedToken).filter(RevokedToken.jti == jti).first()`
      - If a result is found, raise `credentials_exception` (HTTP 401)
    - Import `RevokedToken` from `.models`
    - _Bug_Condition: isBugCondition_6 — token.exp - token.iat > 3600 OR no revoked_tokens table OR jti absent_
    - _Expected_Behavior: JWT expires after 60 min; jti present; revoked jti → 401_
    - _Preservation: Valid non-revoked tokens within 60-minute window continue to authenticate_
    - _Requirements: 2.10, 2.11, 2.12, 3.8_

  - [ ] 8.3 Implement full logout endpoint with `jti` revocation in `routes/auth.py`
    - Update (or create) `POST /api/auth/logout` to:
      - Accept `response: Response`, `vaultkey_session: Optional[str] = Cookie(default=None)`, `db: Session = Depends(get_db)`
      - If `vaultkey_session` is present, decode the JWT and extract `jti`
      - Insert `RevokedToken(jti=jti)` into the database
      - Call `response.delete_cookie("vaultkey_session")`
      - Return `{"status": "logged out"}`
    - Wrap the JWT decode in a `try/except JWTError: pass` block (token already invalid → still clear cookie)
    - Import `RevokedToken`, `jwt`, `JWTError`, `SECRET_KEY`, `ALGORITHM` as needed
    - _Requirements: 2.11, 2.12_

  - [ ] 8.4 Verify bug condition exploration test now passes for Issue 6
    - **Property 1: Expected Behavior** - JWT Expiry Reduced and Revocation Enforced
    - Re-run the Issue 6 exploration from task 1
    - Decode a freshly issued JWT: verify `exp - iat == 3600` and `jti` is present
    - Call `POST /api/auth/logout`, then make an authenticated request with the same cookie: verify HTTP 401
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.10, 2.11, 2.12_

  - [ ] 8.5 Verify preservation tests still pass after Issue 6 fix
    - **Property 2: Preservation** - Valid Non-Revoked Tokens Still Authenticate
    - Re-run the 3.8 preservation tests from task 2
    - Confirm that `GET /api/auth/me` with a valid, non-revoked cookie within 60 minutes returns the user object
    - Write property: for all freshly issued, non-revoked JTIs, authenticated endpoints return 200
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 9. Fix Issue 7 — Silent OSError on File Deletion [MEDIUM]

  - [ ] 9.1 Add logger and replace silent `except OSError: pass` in `routes/files.py`
    - Add at the top of the file: `import logging` and `logger = logging.getLogger(__name__)`
    - Replace the bare `except OSError: pass` block with:
      ```python
      except OSError as e:
          logger.error(f"Failed to delete ciphertext blob {f.storage_path}: {e}")
      ```
    - Ensure execution continues after logging (do not re-raise) so the DB record deletion still proceeds
    - _Bug_Condition: isBugCondition_7 — os.remove() raises OSError AND handler is "except OSError: pass"_
    - _Expected_Behavior: OSError logged at ERROR level with file path and exception; execution continues_
    - _Preservation: Successful deletions return 200 with success response; no spurious logger calls_
    - _Requirements: 2.13, 3.9_

  - [ ] 9.2 Verify bug condition exploration test now passes for Issue 7
    - **Property 1: Expected Behavior** - OSError Logged on File Deletion Failure
    - Re-run the Issue 7 exploration from task 1 (mock `os.remove` to raise `OSError`)
    - Verify `logger.error` is called with the file path and exception details
    - Verify the endpoint still returns 200 and the DB record is deleted
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.13_

  - [ ] 9.3 Verify preservation tests still pass after Issue 7 fix
    - **Property 2: Preservation** - Successful Deletion Still Works
    - Re-run the 3.9 preservation tests from task 2
    - Confirm `DELETE /api/files/{id}` with a file that exists on disk returns 200 with no logger error
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 10. Fix Issue 8 — Inconsistent Audit Logging [MEDIUM]

  - [ ] 10.1 Extract `_log_event` helper and replace all inline `AccessLog` constructions in `routes/access.py`
    - Add `_log_event` helper at the top of the file (after imports):
      ```python
      def _log_event(db: Session, share: ShareLink, event: str, log_status: str, request: Request) -> None:
          user_agent = request.headers.get("user-agent")
          client_ip = request.client.host if request.client else None
          db.add(AccessLog(
              share_id=share.id,
              file_id=share.file_id,
              owner_id=share.owner_id,
              event=event,
              status=log_status,
              user_agent=user_agent,
              ip_address=client_ip
          ))
          db.commit()
      ```
    - Replace every inline `db.add(AccessLog(...))` + `db.commit()` block in `check_recipient_access`, `authorize_password`, and `download_encrypted_file` with the corresponding `_log_event(db, share, event, status, request)` call
    - Remove the now-redundant inline `user_agent` and `client_ip` local variable declarations from each route handler (they are computed inside the helper)
    - _Bug_Condition: isBugCondition_8 — AccessLog constructed inline AND no shared helper function_
    - _Expected_Behavior: All AccessLog writes go through _log_event(); ip_address and user_agent always populated_
    - _Preservation: All existing event types (ACCESS_DENIED, LINK_EXPIRED, ACCESS_ATTEMPT, PASSWORD_FAILED, ACCESS_GRANTED, FILE_DOWNLOADED) still recorded with complete fields_
    - _Requirements: 2.14, 3.10_

  - [ ] 10.2 Verify bug condition exploration test now passes for Issue 8
    - **Property 1: Expected Behavior** - Audit Logging Uses Shared Helper
    - Re-run the Issue 8 exploration from task 1
    - Verify no inline `db.add(AccessLog(` calls remain in `access.py`
    - Trigger each event type and verify every `AccessLog` record has non-null `ip_address` and `user_agent`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.14_

  - [ ] 10.3 Verify preservation tests still pass after Issue 8 fix
    - **Property 2: Preservation** - All Audit Event Types Still Recorded
    - Re-run the 3.10 preservation tests from task 2
    - Trigger all 6 event types and confirm records appear in `access_logs` with complete fields
    - Write property: for all event types, resulting AccessLog records have non-null ip_address, user_agent, event, status, share_id, file_id, owner_id
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 11. Fix Issue 9 — SQLite Not Suitable for Production [LOW]

  - [ ] 11.1 Create `backend/.env.example` with required environment variable documentation
    - Create the file with contents:
      ```
      # Required — set a long random string in production (e.g., openssl rand -hex 32)
      JWT_SECRET=change-me-to-a-long-random-secret

      # Comma-separated list of allowed frontend origins
      ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

      # Database connection — PostgreSQL is required for production
      # Example: postgresql://vaultkey_user:password@localhost:5432/vaultkey
      DATABASE_URL=sqlite:///./vaultkey.db
      ```
    - _Bug_Condition: isBugCondition_9 — no .env.example AND no operator guidance_
    - _Expected_Behavior: .env.example exists with DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS documented_
    - _Requirements: 2.15_

  - [ ] 11.2 Add operator guidance comment in `backend/app/database.py`
    - Add comment block above the `DATABASE_URL` assignment:
      ```python
      # Configure DATABASE_URL in your environment for production.
      # SQLite (default) is suitable for development only.
      # For production, use PostgreSQL:
      #   DATABASE_URL=postgresql://vaultkey_user:password@localhost:5432/vaultkey
      ```
    - _Requirements: 2.15, 3.11_

  - [ ] 11.3 Verify bug condition exploration test now passes for Issue 9
    - **Property 1: Expected Behavior** - Production Documentation Present
    - Re-run the Issue 9 exploration from task 1
    - Verify `backend/.env.example` exists and contains `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`
    - Verify `database.py` contains the operator guidance comment
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.15_

  - [ ] 11.4 Verify preservation tests still pass after Issue 9 fix
    - **Property 2: Preservation** - PostgreSQL-Configured App Still Starts Normally
    - Re-run the 3.11 preservation tests from task 2
    - Confirm application starts and operates normally with a correctly configured `DATABASE_URL`
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 12. Fix Issue 10 — Missing `__init__.py` in Routes Package [LOW]

  - [ ] 12.1 Create `backend/app/routes/__init__.py`
    - Create an empty file at `backend/app/routes/__init__.py`
    - No content required; its presence marks the directory as an explicit Python package
    - _Bug_Condition: isBugCondition_10 — __init__.py does not exist in backend/app/routes/_
    - _Expected_Behavior: routes/ resolved as explicit package; consistent import behavior across Python versions and tooling_
    - _Preservation: All existing route modules (auth, files, shares, access, activity) continue to import and register without errors_
    - _Requirements: 2.16, 3.12_

  - [ ] 12.2 Verify bug condition exploration test now passes for Issue 10
    - **Property 1: Expected Behavior** - Routes Package Has `__init__.py`
    - Re-run the Issue 10 exploration from task 1
    - Verify `backend/app/routes/__init__.py` exists
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.16_

  - [ ] 12.3 Verify preservation tests still pass after Issue 10 fix
    - **Property 2: Preservation** - All Route Modules Still Import Correctly
    - Re-run the 3.12 preservation tests from task 2
    - Import all 5 routers programmatically and confirm no ImportError is raised
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [ ] 13. Checkpoint — Ensure all tests pass
  - Re-run the full exploration test suite (Property 1 checks for all 10 issues): all must PASS
  - Re-run the full preservation test suite (Property 2 checks for all 12 preservation requirements): all must PASS
  - Confirm no inline `db.add(AccessLog(` calls remain in `access.py`
  - Confirm `backend/app/routes/__init__.py` and `backend/.env.example` exist
  - Confirm `localStorage` reads/writes for `vaultkey_token` have been removed from all frontend files
  - Confirm `"*"` does not appear in any origins configuration
  - Confirm `JWT_SECRET` fallback string is removed from `security.py`
  - Ensure all tests pass; ask the user if questions arise.
