# Implementation Plan: Firebase Auth Integration

## Overview

Replace VaultKey's custom PBKDF2/JWT authentication layer with Firebase Authentication. The backend verifies Firebase ID tokens via the Firebase Admin SDK; the frontend authenticates via the Firebase client SDK (email/password and Google Sign-In). All file, share, and access-log functionality is untouched. The system remains fully operational after each task.

## Tasks

- [x] 1. Add `firebase-admin` to `backend/requirements.txt`
  - Append `firebase-admin>=6.0.0` to `backend/requirements.txt`
  - No other changes needed in this task
  - _Requirements: 2.5_
  - **Verify**: `grep "firebase-admin" backend/requirements.txt` returns the line; `pip install -r backend/requirements.txt` succeeds

- [ ] 2. Create `backend/app/firebase_admin.py` — singleton init and token verifier
  - Create the file `backend/app/firebase_admin.py`
  - Declare a module-level sentinel `_firebase_app: firebase_admin.App | None = None`
  - Implement `_get_app() -> firebase_admin.App`:
    - Read `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` from `os.environ`
    - Collect missing vars into a list; raise `RuntimeError(f"Missing Firebase env vars: {missing}")` if non-empty
    - Apply `.replace("\\n", "\n")` to `FIREBASE_PRIVATE_KEY` before use
    - Build `firebase_admin.credentials.Certificate({"type": "service_account", "project_id": ..., "client_email": ..., "private_key": ..., "token_uri": "https://oauth2.googleapis.com/token"})`
    - Call `firebase_admin.initialize_app(cred)` only if `_firebase_app` is `None`; store result in the module-level sentinel
    - Return the app
  - Implement `verify_firebase_token(token: str) -> dict`:
    - Call `_get_app()` to ensure init
    - Call `firebase_admin.auth.verify_id_token(token)` and return the decoded claims dict
    - Let any `firebase_admin.auth.InvalidIdTokenError` (or subclass) propagate to the caller
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.4, 3.5_
  - **Verify**: import the module in a Python REPL with env vars set; calling `_get_app()` without env vars raises `RuntimeError`; with all three vars set and a mocked `initialize_app`, it initialises once

  - [ ] 2.1 Write property test for `_get_app()` missing-env-var behaviour
    - Use `pytest` + `hypothesis`; add `hypothesis>=6.0.0` to dev requirements if not present
    - `@given(st.frozensets(st.sampled_from(["FIREBASE_PROJECT_ID","FIREBASE_CLIENT_EMAIL","FIREBASE_PRIVATE_KEY"]), min_size=1))`
    - For each subset of missing vars, monkeypatch `os.environ` to remove them and assert `RuntimeError` is raised naming those vars
    - Tag: `# Feature: firebase-auth-integration, Property 2: Missing backend env vars raise RuntimeError`
    - Minimum 100 iterations (`@settings(max_examples=100)`)
    - _Requirements: 2.2_

  - [ ] 2.2 Write property test for `verify_firebase_token` claims pass-through
    - `@given(st.text(min_size=1, alphabet=st.characters(whitelist_categories=("L","N"))), st.emails())`
    - Mock `firebase_admin.auth.verify_id_token` to return `{"uid": uid, "email": email}`
    - Assert returned dict's `uid` and `email` exactly match inputs
    - Tag: `# Feature: firebase-auth-integration, Property 3: Valid token claims pass through Token_Verifier`
    - _Requirements: 3.1, 3.4_

- [ ] 3. Update `backend/app/models.py` — add `firebase_uid`, `updated_at`; make `hashed_password` and `email` nullable
  - In the `User` class add after the `email` column:
    ```python
    firebase_uid = Column(String(128), unique=True, nullable=True, index=True)
    ```
  - After `created_at` add:
    ```python
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    ```
  - Change `email` column: `nullable=True` (was `nullable=False`)
  - Change `hashed_password` column: `nullable=True` (was `nullable=False`)
  - No other columns or relationships change
  - Write and run the Alembic migration (or equivalent `ALTER TABLE` SQL on the development SQLite db):
    1. `ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128) UNIQUE` (nullable)
    2. `ALTER TABLE users ADD COLUMN updated_at TIMESTAMP` (nullable)
    3. Alter `hashed_password` to allow NULL (SQLite: recreate table; PostgreSQL: `ALTER COLUMN hashed_password DROP NOT NULL`)
    4. Alter `email` to allow NULL (same approach)
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - **Verify**: Start the backend; existing rows still load; a new `User(firebase_uid="test", email=None, hashed_password=None)` can be committed without error

  - [ ] 3.1 Write unit test — model nullable fields accepted
    - Create an in-memory SQLite session (using `create_engine("sqlite:///:memory:")`)
    - Insert a `User` with `hashed_password=None` and `email=None` and `firebase_uid="uid_test"`; assert no `IntegrityError`
    - Insert a second `User` with the same `firebase_uid`; assert `IntegrityError` is raised (unique constraint)
    - _Requirements: 5.1, 5.3_

- [ ] 4. Update `backend/app/schemas.py` — make `email` optional in `UserResponse`; remove dead schemas
  - Change `UserResponse.email` from `str` to `Optional[str]`; import `Optional` from `typing` if not already present
  - Add `updated_at: Optional[datetime] = None` field to `UserResponse`
  - Remove `UserRegister`, `UserLogin`, and `TokenResponse` schemas entirely (no longer used after tasks 5 and 6)
  - _Requirements: 6.1, 6.2, 15.1_
  - **Verify**: Backend starts; `GET /api/auth/me` serialises a user with a null email without error

- [x] 5. Replace `get_current_user()` in `backend/app/security.py` with Firebase token verification; remove JWT/password helpers
  - **Remove** the following from `security.py`:
    - `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES` constants
    - `pwd_context` (`CryptContext`) instantiation
    - `hash_password()` function
    - `verify_password()` function
    - `create_access_token()` function
    - `oauth2_scheme` (`OAuth2PasswordBearer`) instance
    - Imports: `passlib`, `jose`/`JWTError`, `OAuth2PasswordBearer`, `timedelta`, `Optional`
  - **Keep unchanged** (byte-for-byte):
    - `hash_share_token(token: str) -> str`
    - `generate_secure_token() -> str`
  - **Add** the new `get_current_user` dependency exactly as specified in the design:
    ```python
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    from sqlalchemy.exc import IntegrityError
    from .firebase_admin import verify_firebase_token
    from .models import User

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
  - Retain all existing imports that are still used (`os`, `secrets`, `hashlib`, `Depends`, `HTTPException`, `Session`, `get_db`)
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 6.4, 6.5_
  - **Verify**: Backend starts without import errors; `GET /api/auth/me` with a missing `Authorization` header returns 401

  - [x] 5.1 Write property test — invalid tokens always return HTTP 401
    - `@given(st.text())`
    - Mock `verify_firebase_token` to raise `Exception`; call `get_current_user()` via FastAPI `TestClient`; assert status 401
    - Tag: `# Feature: firebase-auth-integration, Property 4: Invalid tokens always produce HTTP 401`
    - _Requirements: 3.2_

  - [x] 5.2 Write property test — existing user returned without duplication
    - `@given(st.text(min_size=1, alphabet=st.characters(whitelist_categories=("L","N"))))`
    - Pre-seed a user with the given `firebase_uid`; call `get_current_user()` twice with the same token; assert total count of users with that `firebase_uid` is exactly 1
    - Tag: `# Feature: firebase-auth-integration, Property 5: Existing user returned without duplication`
    - _Requirements: 4.1, 4.4_

  - [x] 5.3 Write property test — new user provisioned with correct fields
    - `@given(st.text(min_size=1, ...), st.emails())`
    - For a `firebase_uid`/`email` pair not in the DB, call `get_current_user()`; assert created user has correct `firebase_uid`, `email`, `hashed_password is None`, and UUID-formatted `id`
    - Tag: `# Feature: firebase-auth-integration, Property 6: New user provisioned with correct fields`
    - _Requirements: 4.2, 5.5_

  - [x] 5.4 Write property test — all authenticated requests return user with UUID id
    - `@given(st.text(min_size=1))`
    - Mock a valid token; assert `get_current_user()` returns a `User` whose `id` matches UUID v4 pattern (`[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`)
    - Tag: `# Feature: firebase-auth-integration, Property 7: All authenticated requests return User with UUID id`
    - _Requirements: 4.5, 15.4_

  - [x] 5.5 Write property tests — `hash_share_token` and `generate_secure_token` preserved
    - `@given(st.text())` — assert `hash_share_token(s) == hashlib.sha256(s.encode()).hexdigest()`
    - Tag: `# Feature: firebase-auth-integration, Property 8: hash_share_token is byte-for-byte preserved`
    - `@given(st.integers(min_value=1, max_value=50))` (call count) — assert each result is non-empty and matches `^[A-Za-z0-9_-]+$` with length ≥ 32
    - Tag: `# Feature: firebase-auth-integration, Property 9: generate_secure_token produces valid URL-safe tokens`
    - _Requirements: 6.4, 6.5_

- [x] 6. Remove `POST /register` and `POST /login` from `backend/app/routes/auth.py`; clean up imports
  - Delete the `register_user` function and its `@router.post("/register", ...)` decorator
  - Delete the `login_user` function and its `@router.post("/login", ...)` decorator
  - Remove all imports that are no longer needed: `UserRegister`, `UserLogin`, `TokenResponse`, `hash_password`, `verify_password`, `create_access_token`
  - Keep `get_current_user` import and the `GET /me` endpoint unchanged:
    ```python
    @router.get("/me", response_model=UserResponse)
    def get_me(current_user: User = Depends(get_current_user)):
        return UserResponse.model_validate(current_user)
    ```
  - _Requirements: 6.1, 6.2, 6.3_
  - **Verify**: Backend starts; `POST /api/auth/register` returns 405 or 404; `POST /api/auth/login` returns 405 or 404; `GET /api/auth/me` with a valid (mocked) Firebase token returns 200

  - [x] 6.1 Write unit tests — removed routes and preserved `/me`
    - Assert `POST /api/auth/register` returns 404 or 405
    - Assert `POST /api/auth/login` returns 404 or 405
    - Assert `GET /api/auth/me` with missing `Authorization` header returns 401
    - Assert `GET /api/auth/me` with a mocked valid Firebase token returns 200 and user data
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Update `backend/.env.example` with Firebase Admin variables
  - Remove the `JWT_SECRET` variable and its comment block
  - Add the three Firebase Admin variables with descriptive placeholder values:
    ```
    # Firebase Admin SDK credentials (from Firebase Console → Project Settings → Service Accounts)
    FIREBASE_PROJECT_ID=your-firebase-project-id
    FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
    FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
    ```
  - Retain `DATABASE_URL` and `PORT` entries unchanged
  - _Requirements: 2.4_
  - **Verify**: File contains all three `FIREBASE_*` keys and no longer contains `JWT_SECRET`

- [x] 8. Checkpoint — backend is fully operational with Firebase auth
  - Ensure all backend tests pass (`pytest backend/`)
  - Start the backend (`uvicorn app.main:app`); confirm startup succeeds (no import errors from missing `firebase-admin` or removed modules)
  - Ask the user if there are any questions before proceeding to frontend changes

- [x] 9. Install the `firebase` npm package in the frontend
  - Run `npm install firebase@^10.0.0` inside the `frontend/` directory
  - Confirm `firebase` appears in `frontend/package.json` under `dependencies`
  - _Requirements: 1.1_
  - **Verify**: `node_modules/firebase` exists; `package.json` lists `firebase`

- [ ] 10. Create `frontend/src/config/firebase.js` — Firebase client SDK singleton
  - Create the new file at `frontend/src/config/firebase.js`
  - Validate all six required env vars at module load time; collect missing into an array; if non-empty, log `console.error("Firebase config: missing env vars:", missing)` before continuing
  - Call `initializeApp(firebaseConfig)` and export both the app and `auth`:
    ```javascript
    import { initializeApp } from 'firebase/app';
    import { getAuth } from 'firebase/auth';

    const required = [
      'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID',
    ];
    const missing = required.filter(k => !import.meta.env[k]);
    if (missing.length > 0) {
      console.error('Firebase config: missing env vars:', missing);
    }

    const firebaseConfig = {
      apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    };

    const app = initializeApp(firebaseConfig);
    export const auth = getAuth(app);
    export default app;
    ```
  - _Requirements: 1.1, 1.2, 1.3_
  - **Verify**: Import the module in a Vitest test with all six vars mocked; no error. Import with one var missing; `console.error` is called

  - [ ] 10.1 Write unit test — missing env vars trigger `console.error`
    - Mock `import.meta.env` to omit one or more `VITE_FIREBASE_*` keys
    - Spy on `console.error`; re-import (or call the validation logic); assert `console.error` was called with a message naming the missing var(s)
    - Tag: `// Feature: firebase-auth-integration, Property 1: Missing env vars prevent initialization`
    - _Requirements: 1.2_

- [x] 11. Update `frontend/.env.example` with `VITE_FIREBASE_*` variables
  - Append the six Firebase frontend variables to `frontend/.env.example`:
    ```
    # Firebase client SDK configuration (from Firebase Console → Project Settings → General)
    VITE_FIREBASE_API_KEY=your-api-key-here
    VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your-project-id
    VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
    VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
    ```
  - Retain `VITE_API_BASE_URL` unchanged
  - _Requirements: 1.4_
  - **Verify**: File contains all six `VITE_FIREBASE_*` placeholder entries

- [ ] 12. Update `frontend/src/services/api.js` — replace `localStorage` token read with `getIdToken()`
  - Add import at the top: `import { auth } from '../config/firebase';`
  - Replace the `localStorage.getItem('vaultkey_token')` call:
    ```javascript
    let token = null;
    if (auth.currentUser) {
      token = await auth.currentUser.getIdToken();
    }
    ```
  - Make `request()` async if it isn't already (it already is; no signature change needed)
  - Remove the `const token = localStorage.getItem(...)` line entirely
  - All remaining logic (header construction, fetch, error handling, response parsing) is unchanged
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - **Verify**: Existing call sites in `FilesPage`, `ShareRecipientPage`, etc. require no changes; unit test passes (see 12.1)

  - [ ] 12.1 Write property test — `Authorization` header set iff `currentUser` is non-null
    - Use `fast-check`; add `fast-check` to `devDependencies` if not present
    - `fc.string()` as mock `idToken`; mock `auth.currentUser` as non-null object with `getIdToken: () => Promise.resolve(idToken)`
    - Assert `Authorization` header equals `"Bearer " + idToken`
    - Also assert no `Authorization` header is sent when `auth.currentUser` is null
    - Tag: `// Feature: firebase-auth-integration, Property 11: API requests attach Bearer token when signed in`
    - _Requirements: 12.1, 12.4_

- [ ] 13. Replace `frontend/src/services/authService.js` — remove login/register/logout wrappers; keep `getCurrentUser`
  - Remove `loginUser`, `registerUser`, `logoutUser` functions entirely (these are now handled in `AuthContext` via the Firebase SDK)
  - Remove the `localStorage.setItem` / `localStorage.removeItem` calls that were inside those functions
  - Retain only:
    ```javascript
    import { request } from './api';

    export async function getCurrentUser() {
      return await request('/auth/me', { method: 'GET' });
    }
    ```
  - _Requirements: 6.1, 6.2, 7.8_
  - **Verify**: No import of `loginUser`/`registerUser`/`logoutUser` exists anywhere in the codebase after this task

- [ ] 14. Replace `frontend/src/context/AuthContext.jsx` — `onAuthStateChanged` replaces `localStorage` polling; add new methods
  - Replace the entire file content with the Firebase-backed implementation:
    - Import `onAuthStateChanged`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signOut`, `signInWithPopup`, `GoogleAuthProvider`, `sendEmailVerification`, `sendPasswordResetEmail` from `firebase/auth`
    - Import `auth` from `../config/firebase`
    - Remove imports of `loginUser`, `registerUser`, `logoutUser` from `authService`; keep `getCurrentUser` if it's still needed (it is — for sync with backend `/me` on first load if desired, but auth state itself comes from Firebase)
    - Keep the `darkMode` / `toggleDarkMode` logic entirely unchanged (reads/writes `localStorage.getItem/setItem('vaultkey_theme')`)
    - Replace the `useEffect` that polls `localStorage` for `vaultkey_token` with:
      ```javascript
      useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          setUser(firebaseUser);
          setIsAuthenticated(!!firebaseUser);
          setLoading(false);
        });
        return unsubscribe;
      }, []);
      ```
    - Implement methods:
      - `login(email, password)` → `signInWithEmailAndPassword(auth, email, password)` (propagate errors)
      - `register(email, password)` → `createUserWithEmailAndPassword(auth, email, password)` (propagate errors)
      - `logout()` → `signOut(auth)`
      - `loginWithGoogle()` → `signInWithPopup(auth, new GoogleAuthProvider())` (propagate errors)
      - `sendVerificationEmail()` → `sendEmailVerification(auth.currentUser)`
      - `sendPasswordReset(email)` → `sendPasswordResetEmail(auth, email)`
    - Expose all of the above plus `user`, `loading`, `isAuthenticated`, `darkMode`, `toggleDarkMode` in the context value
    - Remove all `localStorage.getItem/setItem/removeItem('vaultkey_token')` calls
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 11.1, 11.2_
  - **Verify**: App loads; unauthenticated users are redirected to `/login`; `loading` spinner shows briefly then resolves

  - [ ] 14.1 Write property test — `onAuthStateChanged` controls `isAuthenticated` and `loading`
    - Use `fast-check`: `fc.record({ uid: fc.string(), email: fc.emailAddress() })`
    - Mock `onAuthStateChanged` to emit the generated Firebase user; render `AuthProvider`; assert `isAuthenticated === true` and `loading === false`
    - Also emit `null`; assert `isAuthenticated === false`, `user === null`, `loading === false`
    - Tag: `// Feature: firebase-auth-integration, Property 10: Auth state transitions on onAuthStateChanged`
    - _Requirements: 7.2, 7.3_

  - [ ] 14.2 Write property test — Firebase auth errors propagate from `login` and `register`
    - `fc.constantFrom('auth/wrong-password', 'auth/user-not-found', 'auth/email-already-in-use', 'auth/weak-password')`
    - Mock `signInWithEmailAndPassword` / `createUserWithEmailAndPassword` to throw an error with the given code
    - Call `login()` / `register()` through the context; assert the error is re-thrown (not swallowed)
    - Tag: `// Feature: firebase-auth-integration, Property 12: Firebase auth errors propagate from login and register`
    - _Requirements: 8.2, 8.4_

- [ ] 15. Create `frontend/src/pages/ForgotPasswordPage.jsx`
  - Create the file at `frontend/src/pages/ForgotPasswordPage.jsx`
  - Mirror the visual structure of `LoginPage.jsx`: same `min-h-screen` wrapper, same `rounded-2xl` card, same Shield icon and brand color header, same Tailwind utility classes
  - State: `email`, `loading`, `error`, `success`
  - On submit: call `sendPasswordReset(email)` from `useAuth()`; on resolution (success or unknown email) show `"If that address is registered, a reset link has been sent."` — never expose whether the account exists; on network error set `error` state
  - Include a "Back to login" link (`<Link to="/login">`)
  - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - **Verify**: Navigate to `/forgot-password`; form renders; submitting shows the neutral success message

  - [ ] 15.1 Write unit test — `ForgotPasswordPage` renders and shows success message
    - Render `<ForgotPasswordPage />` with `AuthContext` mocked (`sendPasswordReset: vi.fn().mockResolvedValue()`)
    - Submit with any email; assert the success message text appears
    - Assert no email-existence information is revealed regardless of whether `sendPasswordReset` resolves or rejects with a non-network error
    - _Requirements: 11.2, 11.4_

- [ ] 16. Add `/forgot-password` route to `frontend/src/App.jsx`
  - Add import: `import { ForgotPasswordPage } from './pages/ForgotPasswordPage';`
  - Add the route inside `<Routes>`, alongside the existing `PublicAuthRoute` entries:
    ```jsx
    <Route
      path="/forgot-password"
      element={
        <PublicAuthRoute>
          <ForgotPasswordPage />
        </PublicAuthRoute>
      }
    />
    ```
  - No other changes to `App.jsx`
  - _Requirements: 11.4, 15.3_
  - **Verify**: `<Link to="/forgot-password">` from `LoginPage` navigates correctly; authenticated users are redirected away from `/forgot-password` by `PublicAuthRoute`

- [ ] 17. Update `frontend/src/pages/LoginPage.jsx` — add Google Sign-In button and Forgot Password link
  - Add `loginWithGoogle` to the `useAuth()` destructure
  - Add a Google Sign-In handler:
    ```javascript
    const handleGoogleSignIn = async () => {
      setError('');
      setLoading(true);
      try {
        await loginWithGoogle();
        navigate('/dashboard');
      } catch (err) {
        setError(err.message || 'Google sign-in failed');
      } finally {
        setLoading(false);
      }
    };
    ```
  - After the email/password `<form>` submit `<Button>`, add a visual divider (`<div>or</div>`) and a Google button:
    ```jsx
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-surface-darkSecondary hover:bg-gray-50 dark:hover:bg-[#1a2535] transition-colors disabled:opacity-50"
    >
      {/* inline SVG Google logo */}
      Sign in with Google
    </button>
    ```
  - Below the password field (inside the form, before the submit button), add:
    ```jsx
    <div className="flex justify-end">
      <Link to="/forgot-password" className="text-xs text-brand-500 hover:underline">
        Forgot password?
      </Link>
    </div>
    ```
  - All existing fields, validation logic, error display, Shield icon, and the "Don't have an account?" footer link remain unchanged
  - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - **Verify**: Login page renders Google button and Forgot password link; clicking Google button calls `loginWithGoogle()`; email/password flow still works

  - [ ] 17.1 Write unit tests — `LoginPage` renders new elements
    - Assert Google Sign-In button is present in the rendered output
    - Assert "Forgot password?" link points to `/forgot-password`
    - Assert existing email/password inputs and submit button still render
    - _Requirements: 13.1, 13.2, 13.3_

- [ ] 18. Update `frontend/src/pages/RegisterPage.jsx` — add Google Sign-In button
  - Add `loginWithGoogle` to the `useAuth()` destructure
  - Add the same `handleGoogleSignIn` handler as in `LoginPage`
  - After the existing form `<Button>`, add the same divider and Google button (identical style)
  - All existing fields (`email`, `password`, `confirmPassword`), validation, error display, Shield icon, and "Already have an account?" footer link remain unchanged
  - _Requirements: 14.1, 14.2, 14.3_
  - **Verify**: Register page renders Google button; clicking it calls `loginWithGoogle()`; email/password registration flow still works

  - [ ] 18.1 Write unit test — `RegisterPage` renders Google Sign-In button
    - Assert Google Sign-In button is present
    - Assert existing email, password, confirm-password inputs still render
    - _Requirements: 14.1, 14.2_

- [ ] 19. Checkpoint — full end-to-end auth flow verification
  - Run the full frontend test suite (`npm run test -- --run` inside `frontend/`)
  - Run the full backend test suite (`pytest backend/`)
  - Manually verify the following flows against a real Firebase project (or a Firebase emulator):
    1. Email/password registration → dashboard redirect → `GET /api/auth/me` returns user data
    2. Sign out → redirected to `/login`
    3. Email/password login with existing account → dashboard
    4. Google Sign-In (popup) → dashboard
    5. Forgot password → form submits → neutral success message shown
    6. Unauthenticated file access (`/share/:token`) continues to work without `Authorization` header
    7. File upload, download, and share operations use `User.id` UUID FK correctly
  - Ensure all tests pass; ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all property tests fall into this category
- Tasks 1–8 cover the complete backend migration; the system is fully functional with the existing frontend until task 9 begins
- Tasks 9–19 cover the complete frontend migration
- Each task references specific requirements for traceability
- Property tests use `hypothesis` (backend) and `fast-check` (frontend); minimum 100 iterations per test
- The `hash_share_token()` and `generate_secure_token()` functions in `security.py` MUST NOT be modified under any circumstances — the shares system depends on them
- Existing `User` rows with `firebase_uid = NULL` remain valid after the migration; they are not deleted
- `UserResponse.email` is made `Optional[str]` because Google Sign-In accounts may not expose an email address

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "3.1", "4"] },
    { "id": 3, "tasks": ["5"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "6"] },
    { "id": 5, "tasks": ["6.1", "7"] },
    { "id": 6, "tasks": ["9"] },
    { "id": 7, "tasks": ["10", "11"] },
    { "id": 8, "tasks": ["10.1", "12"] },
    { "id": 9, "tasks": ["12.1", "13"] },
    { "id": 10, "tasks": ["14"] },
    { "id": 11, "tasks": ["14.1", "14.2", "15"] },
    { "id": 12, "tasks": ["15.1", "16", "17", "18"] },
    { "id": 13, "tasks": ["17.1", "18.1"] }
  ]
}
```
