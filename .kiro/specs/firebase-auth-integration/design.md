# Design Document: Firebase Auth Integration

## Overview

This design replaces VaultKey's custom PBKDF2/JWT authentication layer with Firebase Authentication. The migration is scoped strictly to the authentication boundary: Firebase handles identity on the frontend (email/password and Google Sign-In), the backend verifies Firebase ID tokens via the Firebase Admin SDK, and all existing file, sharing, and audit functionality continues without change.

The internal `User.id` UUID remains the stable foreign key for all data relationships. A new `firebase_uid` column on the `User` model serves as the external identity bridge between Firebase and VaultKey's data layer.

### Key Design Principles

- **Minimal blast radius**: only authentication-related code changes; file, share, and access-log systems are untouched.
- **No custom JWT issuance**: the backend never generates or signs tokens. All tokens are issued by Firebase.
- **Auto-provisioning**: first-time sign-in (email/password or Google) transparently creates a Local_User record with no extra registration step.
- **Backward-compatible interfaces**: `AuthContext` exposes the same `{user, loading, isAuthenticated, login, register, logout, darkMode, toggleDarkMode}` shape, plus three new methods.

---

## Architecture

```mermaid
sequenceDiagram
    participant Browser
    participant Firebase_Auth as Firebase Auth (Google/Email)
    participant AuthContext
    participant API_Client as api.js
    participant FastAPI
    participant Token_Verifier as firebase_admin.py
    participant DB as PostgreSQL

    Browser->>Firebase_Auth: signInWithEmailAndPassword / signInWithPopup
    Firebase_Auth-->>AuthContext: onAuthStateChanged(firebaseUser)
    AuthContext->>AuthContext: setUser, setIsAuthenticated=true

    Browser->>API_Client: request('/files', ...)
    API_Client->>Firebase_Auth: auth.currentUser.getIdToken()
    Firebase_Auth-->>API_Client: ID Token (JWT)
    API_Client->>FastAPI: GET /api/files  Authorization: Bearer <idToken>
    FastAPI->>Token_Verifier: verify_firebase_token(idToken)
    Token_Verifier->>Firebase_Auth: Firebase Admin network verify
    Firebase_Auth-->>Token_Verifier: {uid, email, ...}
    Token_Verifier-->>FastAPI: decoded claims
    FastAPI->>DB: SELECT user WHERE firebase_uid = uid
    DB-->>FastAPI: User (or None → INSERT new User)
    FastAPI-->>Browser: 200 response
```

### Component Boundaries

```
frontend/
  src/
    config/
      firebase.js          ← NEW: Firebase client SDK init (singleton)
    context/
      AuthContext.jsx      ← MODIFY: replace localStorage with Firebase SDK
    services/
      api.js               ← MODIFY: getIdToken() replaces localStorage read
      authService.js       ← MODIFY: remove login/register/logout wrappers
    pages/
      LoginPage.jsx        ← MODIFY: add Google button + forgot-password link
      RegisterPage.jsx     ← MODIFY: add Google button
      ForgotPasswordPage.jsx ← NEW: password-reset flow

backend/
  app/
    firebase_admin.py      ← NEW: Admin SDK singleton + token verifier
    security.py            ← MODIFY: replace JWT logic with Firebase verify
    models.py              ← MODIFY: add firebase_uid, updated_at; nullable hashed_password
    routes/auth.py         ← MODIFY: remove register + login endpoints
  requirements.txt         ← MODIFY: add firebase-admin>=6.0.0
  .env.example             ← MODIFY: add FIREBASE_* vars

frontend/
  .env.example             ← MODIFY: add VITE_FIREBASE_* vars
```

---

## Components and Interfaces

### `frontend/src/config/firebase.js` (NEW)

Initializes the Firebase client app and exports the `Auth` singleton. Validates all six required environment variables at module load time, logging a descriptive console error for any that are missing before any sign-in attempt can be made.

```javascript
// Exports:
export const auth;   // FirebaseAuth singleton
export default app;  // FirebaseApp singleton
```

**Initialization guard**: builds a `missing` array from the six `VITE_FIREBASE_*` keys; logs `console.error(...)` if non-empty. The app still calls `initializeApp` (Firebase SDK handles partial config gracefully), but the error surfaces immediately in the browser console.

---

### `backend/app/firebase_admin.py` (NEW)

Manages the Firebase Admin SDK lifecycle on the backend. Uses a module-level `_firebase_app` sentinel so the SDK is initialized exactly once per process.

```python
def _get_app() -> firebase_admin.App:
    """Initialize (once) or return the existing Firebase Admin app."""

def verify_firebase_token(token: str) -> dict:
    """
    Verify a Firebase ID token using the Admin SDK.
    Returns decoded claims dict containing at minimum 'uid' and 'email'.
    Raises firebase_admin.auth.InvalidIdTokenError (or subclass) on failure.
    """
```

**Startup validation**: `_get_app()` checks `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. If any are absent it raises `RuntimeError` with the list of missing variable names. This causes FastAPI startup to fail-fast rather than accepting requests that will always return 401.

**Private key handling**: `FIREBASE_PRIVATE_KEY` is read with `.replace("\\n", "\n")` to handle the common shell/Docker env var encoding of newlines.

---

### `backend/app/security.py` (MODIFIED)

**Removed**:
- `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- `pwd_context` (CryptContext), `hash_password()`, `verify_password()`
- `create_access_token()`
- `OAuth2PasswordBearer` scheme
- `jose` / `JWTError` imports

**Kept unchanged**:
- `hash_share_token(token: str) -> str` — SHA-256 hex digest, unchanged byte-for-byte
- `generate_secure_token() -> str` — `secrets.token_urlsafe(32)`, unchanged

**New `get_current_user` dependency**:

```python
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from .firebase_admin import verify_firebase_token

http_bearer = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: Session = Depends(get_db)
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        decoded = verify_firebase_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    firebase_uid = decoded["uid"]
    email = decoded.get("email")

    user = db.query(User).filter(User.firebase_uid == firebase_uid).first()
    if user is None:
        user = User(firebase_uid=firebase_uid, email=email)
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            db.rollback()
            user = db.query(User).filter(User.firebase_uid == firebase_uid).first()
    return user
```

The `IntegrityError` catch-and-retry pattern handles the race condition where two concurrent first-time requests arrive for the same `firebase_uid`: one wins the insert, the other catches the unique constraint violation, rolls back, and re-queries to return the winner's record.

---

### `backend/app/models.py` — User model (MODIFIED)

```python
class User(Base):
    __tablename__ = "users"
    id             = Column(String(36),  primary_key=True, default=generate_uuid)
    email          = Column(String(255), unique=True, nullable=True,  index=True)
    firebase_uid   = Column(String(128), unique=True, nullable=True,  index=True)   # NEW
    hashed_password= Column(String(255), nullable=True)   # was nullable=False
    created_at     = Column(DateTime,    default=datetime.utcnow)
    updated_at     = Column(DateTime,    nullable=True, onupdate=datetime.utcnow)   # NEW
    # relationships: files, shares, access_logs — UNCHANGED
```

`email` is also made nullable to accommodate Google Sign-In accounts that may not expose an email address (rare, but possible with Firebase). The `id` UUID primary key and all relationships are unchanged.

A database migration (Alembic or equivalent) is required to:
1. Add `firebase_uid VARCHAR(128) UNIQUE` column (nullable)
2. Add `updated_at TIMESTAMP` column (nullable)
3. Alter `hashed_password` to allow NULL
4. Alter `email` to allow NULL

---

### `backend/app/routes/auth.py` (MODIFIED)

Removes `POST /api/auth/register` and `POST /api/auth/login` entirely. Retains only:

```python
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
```

All imports of `hash_password`, `verify_password`, `create_access_token`, `UserRegister`, `UserLogin`, `TokenResponse` are removed.

---

### `frontend/src/context/AuthContext.jsx` (MODIFIED)

Replaces the localStorage-based token check on mount with Firebase's `onAuthStateChanged` listener.

**State shape** (unchanged):
```javascript
{ user, loading, isAuthenticated }
```

**Exposed interface** (backward-compatible + additions):
```javascript
{
  // unchanged
  user, loading, isAuthenticated,
  login(email, password),
  register(email, password),
  logout(),
  darkMode, toggleDarkMode,

  // new
  loginWithGoogle(),
  sendVerificationEmail(),
  sendPasswordReset(email),
}
```

**Auth state lifecycle**:
```javascript
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
    setUser(firebaseUser);
    setIsAuthenticated(!!firebaseUser);
    setLoading(false);
  });
  return unsubscribe;   // cleanup on unmount
}, []);
```

**Method implementations**:
- `login(email, password)` → `signInWithEmailAndPassword(auth, email, password)` — propagates Firebase errors
- `register(email, password)` → `createUserWithEmailAndPassword(auth, email, password)` — propagates Firebase errors
- `logout()` → `signOut(auth)`
- `loginWithGoogle()` → `signInWithPopup(auth, new GoogleAuthProvider())` — propagates errors
- `sendVerificationEmail()` → `sendEmailVerification(auth.currentUser)`
- `sendPasswordReset(email)` → `sendPasswordResetEmail(auth, email)` — never rejects on unknown email (Firebase default behavior satisfies the non-enumeration requirement)

**darkMode / toggleDarkMode**: unchanged — uses `localStorage` for `vaultkey_theme` only (not authentication-related).

**Removed**: all `localStorage.getItem/setItem/removeItem('vaultkey_token')` calls.

---

### `frontend/src/services/api.js` (MODIFIED)

Replaces the single localStorage read with a `getIdToken()` call:

```javascript
import { auth } from '../config/firebase';

export async function request(endpoint, options = {}) {
  let token = null;
  if (auth.currentUser) {
    token = await auth.currentUser.getIdToken();  // auto-refreshes if near expiry
  }
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // ... rest of function unchanged
}
```

The function signature `request(endpoint, options)` is unchanged so all existing call sites need no modification. `getIdToken()` handles token refresh automatically when the current token is within 5 minutes of expiry.

---

### `frontend/src/services/authService.js` (MODIFIED)

Removes `loginUser`, `registerUser`, `logoutUser` (now handled directly in `AuthContext` via Firebase SDK). Retains:

```javascript
export async function getCurrentUser() {
  return await request('/auth/me', { method: 'GET' });
}
```

---

### `frontend/src/pages/LoginPage.jsx` (MODIFIED — additive only)

Adds to the existing form:
- **Google Sign-In button**: calls `loginWithGoogle()` from `useAuth()`. Styled consistently with the existing Tailwind design (same card, same color palette, white button with Google icon or "Sign in with Google" label).
- **Forgot password link**: `<Link to="/forgot-password">Forgot password?</Link>` placed below the password field or submit button.

All existing email/password fields, validation, error display, Shield icon, and layout are untouched.

---

### `frontend/src/pages/RegisterPage.jsx` (MODIFIED — additive only)

Adds a Google Sign-In button (identical treatment to LoginPage). All existing fields and styling untouched.

---

### `frontend/src/pages/ForgotPasswordPage.jsx` (NEW)

Accessible at `/forgot-password` (added to `App.jsx` as a `PublicAuthRoute`).

**Design**: mirrors LoginPage — `rounded-2xl` card, Shield icon with brand colors, same Tailwind utility classes.

**Behavior**:
1. User enters email and submits.
2. Calls `sendPasswordReset(email)` from `useAuth()`.
3. On success (or unknown email — Firebase resolves both), shows a success message: "If that address is registered, a reset link has been sent." — never reveals whether the account exists.
4. On network/other error, shows an error message.

---

### `frontend/src/App.jsx` (MODIFIED — additive only)

```javascript
import ForgotPasswordPage from './pages/ForgotPasswordPage';
// Inside <Routes>:
<Route path="/forgot-password" element={<PublicAuthRoute><ForgotPasswordPage /></PublicAuthRoute>} />
```

`ProtectedRoute` and `PublicAuthRoute` logic unchanged.

---

## Data Models

### User (after migration)

| Column           | Type         | Constraints                          | Change          |
|------------------|--------------|--------------------------------------|-----------------|
| `id`             | String(36)   | PK, default=UUID                     | unchanged       |
| `email`          | String(255)  | UNIQUE, INDEX, nullable              | nullable added  |
| `firebase_uid`   | String(128)  | UNIQUE, INDEX, nullable              | **NEW**         |
| `hashed_password`| String(255)  | nullable                             | nullable added  |
| `created_at`     | DateTime     | default=utcnow                       | unchanged       |
| `updated_at`     | DateTime     | nullable, onupdate=utcnow            | **NEW**         |

### Relationships (unchanged)

- `User.id` → `FileItem.user_id` (FK)
- `User.id` → `ShareLink.created_by` (FK)
- `User.id` → `AccessLog.user_id` (FK)

### Environment Variables

**Frontend** (`frontend/.env.example`):
```
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**Backend** (`backend/.env.example`):
```
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Missing env vars prevent initialization

*For any* non-empty subset of the required Firebase configuration environment variables (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`), when any of those variables are absent, the frontend Firebase initialization module SHALL log a configuration error before any sign-in attempt.

**Validates: Requirements 1.2**

---

### Property 2: Missing backend env vars raise RuntimeError

*For any* non-empty subset of `{FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY}` that is absent when `_get_app()` is called, a `RuntimeError` SHALL be raised naming the missing variables.

**Validates: Requirements 2.2**

---

### Property 3: Valid token claims pass through Token_Verifier

*For any* decoded claims dict produced by a valid Firebase ID token (containing at minimum `uid` and `email`), the `verify_firebase_token()` function SHALL return a dict whose `uid` and `email` values exactly match the input claims.

**Validates: Requirements 3.1, 3.4**

---

### Property 4: Invalid tokens always produce HTTP 401

*For any* call to `get_current_user()` where `verify_firebase_token()` raises an exception (expired, malformed, invalid signature), the dependency SHALL raise `HTTPException` with status code 401.

**Validates: Requirements 3.2**

---

### Property 5: Existing user returned without duplication

*For any* `firebase_uid` value that already exists in the `users` table, `get_current_user()` SHALL return the existing `User` record and the total count of `User` records with that `firebase_uid` SHALL remain exactly 1.

**Validates: Requirements 4.1, 4.4**

---

### Property 6: New user provisioned with correct fields

*For any* `firebase_uid` and `email` pair that does not exist in the `users` table, calling `get_current_user()` SHALL create exactly one new `User` record where `user.firebase_uid == firebase_uid`, `user.email == email`, `user.hashed_password is None`, and `user.id` is a valid UUID string.

**Validates: Requirements 4.2, 5.5**

---

### Property 7: All authenticated requests return User with UUID id

*For any* valid Firebase ID token, `get_current_user()` SHALL return a `User` object whose `id` field is a non-empty string conforming to UUID v4 format (or any UUID format generated by `generate_uuid`).

**Validates: Requirements 4.5, 15.4**

---

### Property 8: hash_share_token is byte-for-byte preserved

*For any* string `s`, `hash_share_token(s)` SHALL equal `hashlib.sha256(s.encode()).hexdigest()`. This property must hold before and after the migration.

**Validates: Requirements 6.4**

---

### Property 9: generate_secure_token produces valid URL-safe tokens

*For any* call to `generate_secure_token()`, the returned string SHALL be non-empty and contain only URL-safe base64 characters (alphanumeric, `-`, `_`), with a minimum length of 32 characters.

**Validates: Requirements 6.5**

---

### Property 10: Auth state transitions on onAuthStateChanged

*For any* non-null Firebase user object emitted by `onAuthStateChanged`, the `AuthContext` SHALL set `isAuthenticated` to `true` and `loading` to `false`. When `null` is emitted, `isAuthenticated` SHALL be `false`, `user` SHALL be `null`, and `loading` SHALL be `false`.

**Validates: Requirements 7.2, 7.3**

---

### Property 11: API requests attach Bearer token when signed in

*For any* API `request()` call when `auth.currentUser` is non-null, the `Authorization` header SHALL be present and equal to `"Bearer " + idToken` where `idToken` is the value returned by `auth.currentUser.getIdToken()`.

**Validates: Requirements 12.1, 12.4**

---

### Property 12: Firebase auth errors propagate from login and register

*For any* Firebase error thrown by `signInWithEmailAndPassword` or `createUserWithEmailAndPassword`, the `login()` or `register()` method in `AuthContext` SHALL re-throw that error so the calling component receives it.

**Validates: Requirements 8.2, 8.4**

---

## Error Handling

### Backend

| Condition | Response |
|-----------|----------|
| Missing `Authorization` header or non-`Bearer` scheme | HTTP 401 `{"detail": "Not authenticated"}` |
| Token expired, malformed, or invalid Firebase signature | HTTP 401 `{"detail": "Invalid or expired token"}` |
| Concurrent insert race on `firebase_uid` unique constraint | Catch `IntegrityError`, rollback, re-query — return existing record, no 500 |
| Missing Firebase Admin env vars at startup | `RuntimeError` at import time — server fails to start cleanly |

### Frontend

| Condition | Handling |
|-----------|----------|
| Missing `VITE_FIREBASE_*` env vars | `console.error` at module load; sign-in will fail with Firebase SDK error |
| Firebase sign-in error (wrong password, no account) | `AuthContext` propagates error; `LoginPage` / `RegisterPage` displays `error.message` |
| Google popup dismissed by user | `AuthContext` propagates error; calling component handles gracefully |
| Password reset for unknown email | `sendPasswordResetEmail` resolves (Firebase does not reject) — UI shows neutral success message |
| `api.js` request when no current user | No `Authorization` header sent; public endpoints (`/share/:token`) continue to work |

### Migration Safety

Existing `User` records created before this migration will have `firebase_uid = NULL` and `hashed_password` populated. These records remain valid — no data is deleted. A future migration step (out of scope for this feature) may associate existing users with Firebase accounts via email matching after they sign in.

---

## Testing Strategy

This feature involves both pure-function logic (token verification wrapper, user provisioning, URL-safe token generation) and SDK-boundary code (Firebase Admin calls, Firebase client SDK calls). The strategy uses a dual approach:

### Backend Testing (pytest)

**Unit tests** (example-based):
- `_get_app()` raises `RuntimeError` for each combination of missing env vars (also covered by Property 2 PBT)
- `get_current_user()` returns HTTP 401 when `Authorization` header is absent
- `get_current_user()` returns HTTP 401 when scheme is not `Bearer`
- `GET /api/auth/me` returns 200 and user data for a valid mocked token
- `POST /api/auth/register` returns 404 (route removed)
- `POST /api/auth/login` returns 404 (route removed)
- `hash_share_token()` and `generate_secure_token()` preserve existing behavior

**Property-based tests** (pytest + [Hypothesis](https://hypothesis.readthedocs.io/en/latest/)):
- **Property 2**: `@given(st.frozensets(st.sampled_from([...3 keys...]), min_size=1))` — missing any subset raises `RuntimeError`
- **Property 3**: `@given(st.text(), st.emails())` — mocked `verify_id_token` returning `{uid, email}` passes through unchanged
- **Property 4**: `@given(st.text())` — any exception from `verify_firebase_token` maps to HTTP 401
- **Property 5**: `@given(st.text(min_size=1))` — pre-seeded firebase_uid; call twice; count = 1
- **Property 6**: `@given(st.text(min_size=1), st.emails())` — new uid/email; user created with correct fields
- **Property 7**: `@given(st.text(min_size=1))` — returned user.id matches UUID pattern
- **Property 8**: `@given(st.text())` — `hash_share_token(s) == hashlib.sha256(s.encode()).hexdigest()`
- **Property 9**: `@given(st.nothing())` using `st.integers(min_value=1, max_value=50)` call count — all results match URL-safe pattern

Minimum 100 iterations per property test. Each test is tagged with a comment:
`# Feature: firebase-auth-integration, Property N: <property text>`

### Frontend Testing (Vitest + React Testing Library)

**Unit tests** (example-based):
- `firebase.js` logs error when env vars are missing (mock `import.meta.env`)
- `AuthContext` subscribes to `onAuthStateChanged` on mount, unsubscribes on unmount
- `AuthContext` sets `isAuthenticated=true` when user non-null, `false` when null
- `AuthContext` exposes all required interface fields
- `api.js` attaches `Authorization: Bearer <token>` when `auth.currentUser` is set
- `api.js` sends no `Authorization` header when `auth.currentUser` is null
- `LoginPage` renders Google Sign-In button and Forgot Password link
- `RegisterPage` renders Google Sign-In button
- `ForgotPasswordPage` renders at `/forgot-password`, shows success message after submit

**Property-based tests** ([fast-check](https://fast-check.io/)):
- **Property 10**: `fc.record({uid: fc.string(), email: fc.emailAddress()})` — any non-null Firebase user triggers `isAuthenticated=true`
- **Property 11**: `fc.string()` as token — any non-null `currentUser` with any `getIdToken()` result produces correct `Authorization` header
- **Property 12**: `fc.constantFrom(...firebaseErrorCodes)` — any Firebase auth error propagates from `login()`/`register()`

Minimum 100 iterations per property test. Tag format: `// Feature: firebase-auth-integration, Property N: <property text>`

### Integration Tests

- Full auth flow: sign-in with mocked Firebase token → `GET /api/auth/me` returns user data
- Share link access (`/share/:token`) works without `Authorization` header (public endpoint)
- File operations use `User.id` UUID as FK (not `firebase_uid`)
- Concurrent provisioning: two simultaneous requests with same new `firebase_uid` result in exactly one database record

### What is NOT property-tested

- UI visual design (Shield icon, color palette, layout) — smoke-tested by inspection
- Firebase SDK internal behavior (`onAuthStateChanged`, `signOut`, `signInWithPopup`) — tested by Firebase's own test suite
- Database schema column definitions — verified by migration + smoke test
- Route existence/absence (`/register`, `/login` removed; `/forgot-password` added) — example-based tests
