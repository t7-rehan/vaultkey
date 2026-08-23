# Requirements Document

## Introduction

This feature replaces VaultKey's custom PBKDF2/JWT authentication layer with Firebase Authentication. The integration is a targeted authentication-layer upgrade: Firebase handles identity (email/password and Google Sign-In) on the frontend, the backend verifies Firebase ID tokens via the Firebase Admin SDK, and all existing file, sharing, and audit functionality continues to operate unchanged. The internal `User.id` UUID remains the stable foreign key for all data relationships; `firebase_uid` is added as a new external identity reference.

## Glossary

- **Firebase_Auth**: The Firebase Authentication service (client SDK) running in the browser, responsible for sign-in, sign-out, and ID token issuance.
- **Firebase_Admin**: The Firebase Admin SDK running on the backend server, responsible for verifying Firebase ID tokens.
- **ID_Token**: A short-lived JWT issued by Firebase_Auth after successful sign-in, used as the `Authorization: Bearer` credential on all API requests.
- **Firebase_UID**: The stable string identifier assigned by Firebase to each user (e.g., `uid` field in the decoded token). Stored in the `User` model as `firebase_uid`.
- **Local_User**: The VaultKey `User` database record identified by its UUID primary key (`User.id`). All files, shares, and access logs reference `User.id` as their foreign key.
- **Auth_State**: The current authentication status as reported by `onAuthStateChanged`; either authenticated (a Firebase user object is present) or unauthenticated (null).
- **Auth_Context**: The React context (`AuthContext.jsx`) that exposes auth state and methods to the frontend application.
- **API_Client**: The `api.js` request helper that attaches authorization headers to every backend API call.
- **Token_Verifier**: The backend component (`firebase_admin.py`) that validates an incoming ID token using Firebase_Admin and returns the decoded claims.
- **Auth_Router**: The FastAPI router in `routes/auth.py` that exposes `/api/auth/me`.
- **Security_Module**: The `security.py` module on the backend, which provides the `get_current_user()` FastAPI dependency and the `hash_share_token()` / `generate_secure_token()` share utilities.
- **User_Model**: The SQLAlchemy `User` class in `models.py`.

---

## Requirements

### Requirement 1: Firebase Frontend Initialization

**User Story:** As a developer, I want the Firebase client SDK initialized from environment variables, so that the app connects to the correct Firebase project without hardcoded credentials.

#### Acceptance Criteria

1. THE Firebase_Auth SHALL be initialized from the environment variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
2. WHEN any required Firebase environment variable is absent at application startup, THE Firebase_Auth SHALL throw a configuration error that surfaces in the browser console before any sign-in attempt is made.
3. THE Firebase_Auth instance SHALL be exported as a singleton from `frontend/src/config/firebase.js` so that all other modules share the same initialized instance.
4. THE `frontend/.env.example` file SHALL contain placeholder entries for all six `VITE_FIREBASE_*` variables listed in criterion 1.

---

### Requirement 2: Firebase Admin Backend Initialization

**User Story:** As a developer, I want the Firebase Admin SDK initialized on the backend from environment variables, so that the server can verify Firebase ID tokens without embedding service-account files.

#### Acceptance Criteria

1. THE Firebase_Admin SHALL be initialized using the environment variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
2. WHEN any required Firebase Admin environment variable is absent at server startup, THE Firebase_Admin SHALL raise a configuration error that prevents the server from accepting requests.
3. THE Firebase_Admin SHALL be initialized as a singleton; subsequent imports of `firebase_admin.py` SHALL reuse the already-initialized app.
4. THE `backend/.env.example` file SHALL contain placeholder entries for `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
5. THE `backend/requirements.txt` SHALL declare `firebase-admin>=6.0.0` as a dependency.

---

### Requirement 3: Firebase ID Token Verification

**User Story:** As a backend service, I want all authenticated API requests verified via Firebase ID tokens, so that the server never trusts client-supplied identity claims.

#### Acceptance Criteria

1. WHEN a request arrives with an `Authorization: Bearer <token>` header, THE Token_Verifier SHALL verify the token using Firebase_Admin and return the decoded claims containing `uid` and `email`.
2. IF the provided token is expired, malformed, or fails Firebase signature verification, THEN THE Token_Verifier SHALL raise an HTTP 401 Unauthorized error with a descriptive message.
3. IF the `Authorization` header is absent or does not use the `Bearer` scheme, THEN THE Security_Module SHALL raise an HTTP 401 Unauthorized error.
4. THE Token_Verifier SHALL extract the `uid` field from the decoded token claims as the Firebase_UID; THE Token_Verifier SHALL NOT accept a UID supplied by the client in the request body or query parameters.
5. WHEN verifying a token, THE Token_Verifier SHALL call Firebase_Admin network verification; THE Token_Verifier SHALL NOT implement custom JWT signature verification.

---

### Requirement 4: Local User Lookup and Provisioning

**User Story:** As a user signing in for the first time via Firebase, I want a VaultKey account created automatically, so that I can access file storage without a separate registration step.

#### Acceptance Criteria

1. WHEN a verified token contains a Firebase_UID that matches an existing `User.firebase_uid` in the database, THE Security_Module SHALL return that existing Local_User without creating a new record.
2. WHEN a verified token contains a Firebase_UID that does not match any `User.firebase_uid`, THE Security_Module SHALL create a new Local_User record with a generated UUID `id`, the Firebase_UID stored in `firebase_uid`, and the token's `email` stored in `email`.
3. THE Security_Module SHALL complete the lookup or creation of the Local_User within the same database session used by the request, ensuring atomicity.
4. IF two concurrent requests arrive with the same new Firebase_UID simultaneously, THEN THE Security_Module SHALL resolve the race condition by returning the existing record, not creating duplicate users.
5. FOR ALL authenticated requests, THE Security_Module SHALL return a Local_User object whose `id` is the UUID primary key used by all file, share, and access-log foreign-key references.

---

### Requirement 5: User Model Migration

**User Story:** As a database administrator, I want the User model updated to store Firebase UID alongside the existing UUID primary key, so that the external Firebase identity maps to the internal data identity without breaking existing relationships.

#### Acceptance Criteria

1. THE User_Model SHALL include a `firebase_uid` column of type `String(128)` that is unique, indexed, and nullable (to permit migration of existing records).
2. THE User_Model SHALL include an `updated_at` column of type `DateTime` that records the timestamp of the last modification.
3. THE User_Model `hashed_password` column SHALL be made nullable to accommodate users who authenticate exclusively via Firebase (no local password stored).
4. THE User_Model `id` UUID primary key SHALL remain unchanged and SHALL continue to be the foreign key referenced by `FileItem`, `ShareLink`, and `AccessLog`.
5. WHEN a new Local_User is provisioned from a Firebase token, THE User_Model `firebase_uid` SHALL be set to the Firebase_UID from the token and `hashed_password` SHALL be null.

---

### Requirement 6: Backend Auth Route Cleanup

**User Story:** As a backend developer, I want the legacy login and registration endpoints removed, so that the backend no longer manages passwords or issues JWTs directly.

#### Acceptance Criteria

1. THE Auth_Router SHALL NOT expose a `POST /api/auth/register` endpoint after this change is applied.
2. THE Auth_Router SHALL NOT expose a `POST /api/auth/login` endpoint after this change is applied.
3. THE Auth_Router SHALL continue to expose `GET /api/auth/me`, which returns the Local_User record for the currently authenticated user via the updated `get_current_user()` dependency.
4. THE Security_Module `hash_share_token()` function SHALL remain unchanged and functional.
5. THE Security_Module `generate_secure_token()` function SHALL remain unchanged and functional.

---

### Requirement 7: Auth Context and State Management

**User Story:** As a frontend developer, I want the Auth Context to use Firebase's `onAuthStateChanged` as the single source of truth for authentication state, so that the UI reliably reflects sign-in and sign-out events without polling localStorage.

#### Acceptance Criteria

1. WHEN the application mounts, THE Auth_Context SHALL subscribe to `onAuthStateChanged` on the Firebase_Auth instance and update the `user` and `loading` state accordingly.
2. WHEN `onAuthStateChanged` emits a non-null user, THE Auth_Context SHALL set `isAuthenticated` to `true` and `loading` to `false`.
3. WHEN `onAuthStateChanged` emits null, THE Auth_Context SHALL set `isAuthenticated` to `false`, `user` to `null`, and `loading` to `false`.
4. WHEN the component that subscribes to `onAuthStateChanged` unmounts, THE Auth_Context SHALL unsubscribe the listener to prevent memory leaks.
5. THE Auth_Context SHALL expose the same interface as before: `user`, `loading`, `isAuthenticated`, `login`, `register`, `logout`, `darkMode`, and `toggleDarkMode`.
6. THE Auth_Context SHALL additionally expose `loginWithGoogle`, `sendVerificationEmail`, and `sendPasswordReset`.
7. THE Auth_Context `darkMode` and `toggleDarkMode` behavior SHALL remain unchanged from the existing implementation.
8. THE Auth_Context SHALL NOT read from or write to `localStorage` for authentication tokens; token management SHALL be delegated entirely to Firebase_Auth.

---

### Requirement 8: Email/Password Authentication

**User Story:** As a returning user, I want to sign in with my email and password via Firebase, so that I can access my files securely.

#### Acceptance Criteria

1. WHEN a user submits valid email and password credentials, THE Auth_Context `login` method SHALL call the Firebase_Auth email/password sign-in method and return on success.
2. IF the provided credentials are invalid or the account does not exist, THEN THE Auth_Context `login` method SHALL propagate the Firebase error so the calling component can display an appropriate message.
3. WHEN a user submits a new email, password, and confirmed password to register, THE Auth_Context `register` method SHALL call the Firebase_Auth email/password account-creation method.
4. IF the email is already registered, THEN THE Auth_Context `register` method SHALL propagate the Firebase error.
5. WHEN registration succeeds, THE Auth_Context `sendVerificationEmail` method SHALL be callable to trigger a Firebase verification email to the newly registered address.

---

### Requirement 9: Google Sign-In

**User Story:** As a user, I want to sign in with my Google account, so that I can access VaultKey without creating a separate password.

#### Acceptance Criteria

1. WHEN a user initiates Google Sign-In, THE Auth_Context `loginWithGoogle` method SHALL open the Firebase Google OAuth popup and complete the sign-in flow.
2. WHEN Google Sign-In completes successfully, THE Auth_Context SHALL update `user` and `isAuthenticated` via the `onAuthStateChanged` listener, not via a direct state mutation.
3. IF the user dismisses the Google Sign-In popup or an error occurs, THEN THE Auth_Context `loginWithGoogle` method SHALL propagate the error to the calling component.
4. WHEN a user signs in with Google for the first time, THE Security_Module SHALL provision a new Local_User following the same lookup-or-create logic defined in Requirement 4.

---

### Requirement 10: Sign-Out

**User Story:** As a signed-in user, I want signing out to fully clear my session, so that no credentials remain in the browser after I leave.

#### Acceptance Criteria

1. WHEN `logout` is called, THE Auth_Context SHALL call Firebase_Auth `signOut()`.
2. WHEN Firebase_Auth `signOut()` completes, THE Auth_Context SHALL update auth state to unauthenticated via the `onAuthStateChanged` listener.
3. THE Auth_Context `logout` method SHALL NOT leave any Firebase ID token or user reference accessible after sign-out completes.

---

### Requirement 11: Password Reset

**User Story:** As a user who has forgotten their password, I want to request a password reset email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user submits their email address on the Forgot Password page, THE Auth_Context `sendPasswordReset` method SHALL call the Firebase_Auth password-reset email function with the provided address.
2. IF the email address is not associated with any Firebase account, THE Auth_Context `sendPasswordReset` method SHALL still complete without revealing whether the address is registered (to prevent account enumeration).
3. THE Forgot Password page SHALL use the same visual design language (Tailwind CSS, Shield icon, color palette) as the existing Login and Register pages.
4. THE Forgot Password page SHALL be accessible via the `/forgot-password` route.

---

### Requirement 12: API Client Token Attachment

**User Story:** As a frontend developer, I want every API request to automatically carry a fresh Firebase ID token, so that backend authentication is always based on a valid, non-expired credential.

#### Acceptance Criteria

1. WHEN the API_Client makes a request and a Firebase user is signed in, THE API_Client SHALL call `auth.currentUser.getIdToken()` to obtain the current ID_Token and attach it as `Authorization: Bearer <token>`.
2. WHEN the API_Client makes a request and no Firebase user is signed in, THE API_Client SHALL send the request without an `Authorization` header.
3. THE API_Client `request()` function signature SHALL remain unchanged so that all existing call sites require no modification.
4. THE API_Client SHALL NOT read from `localStorage` to obtain authentication tokens.
5. WHEN the Firebase ID_Token is close to expiry, THE API_Client SHALL rely on `getIdToken()` to automatically refresh the token; THE API_Client SHALL NOT implement its own token-refresh logic.

---

### Requirement 13: Login Page UI Updates

**User Story:** As a user on the Login page, I want a Google Sign-In button and a Forgot Password link available alongside the existing email/password form, so that I have multiple convenient sign-in options.

#### Acceptance Criteria

1. THE Login page SHALL retain all existing email/password form fields, validation, and submit behavior.
2. THE Login page SHALL include a Google Sign-In button that invokes `loginWithGoogle` from Auth_Context when clicked.
3. THE Login page SHALL include a Forgot Password link that navigates to the `/forgot-password` route.
4. THE Login page visual design (Shield icon, Tailwind CSS classes, color palette, layout) SHALL remain unchanged except for the two additions above.

---

### Requirement 14: Register Page UI Updates

**User Story:** As a new user on the Register page, I want a Google Sign-In button available alongside the existing registration form, so that I can register with Google instead of creating a password.

#### Acceptance Criteria

1. THE Register page SHALL retain all existing email/password/confirm-password form fields, validation, and submit behavior.
2. THE Register page SHALL include a Google Sign-In button that invokes `loginWithGoogle` from Auth_Context when clicked.
3. THE Register page visual design (Shield icon, Tailwind CSS classes, color palette, layout) SHALL remain unchanged except for the Google Sign-In button addition.

---

### Requirement 15: Preservation of Existing Functionality

**User Story:** As an existing VaultKey user, I want all file upload, download, sharing, access revocation, and audit features to continue working exactly as before after the auth upgrade, so that the migration does not disrupt my data or workflows.

#### Acceptance Criteria

1. THE system SHALL continue to expose all API routes except `POST /api/auth/register` and `POST /api/auth/login` without behavioral change.
2. THE `FileItem`, `ShareLink`, and `AccessLog` models SHALL continue to use `User.id` (UUID) as their foreign key without modification.
3. THE existing frontend routing, `ProtectedRoute`, and `PublicAuthRoute` components SHALL remain functionally unchanged; they SHALL continue to rely on `isAuthenticated` and `loading` from Auth_Context.
4. WHILE a user is authenticated, THE system SHALL correctly associate all file operations with the Local_User identified by `User.id`.
5. THE existing VaultKey UI on all pages other than Login, Register, and the new ForgotPassword page SHALL remain visually and functionally unchanged.
