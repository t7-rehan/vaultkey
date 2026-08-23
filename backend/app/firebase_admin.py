"""
Firebase Admin SDK singleton and ID token verifier.

This module is imported by security.py to verify Firebase ID tokens on every
authenticated request. The Admin SDK is initialized exactly once per process.
"""
import os
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Module-level sentinel — None until first call to _get_app()
_firebase_app: firebase_admin.App | None = None


def _get_app() -> firebase_admin.App:
    """
    Initialize (once) or return the already-initialized Firebase Admin app.

    Reads FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY
    from environment variables. Raises RuntimeError if any are absent so the
    server fails fast at startup rather than returning 401 on every request.
    """
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    required = {
        "FIREBASE_PROJECT_ID": os.environ.get("FIREBASE_PROJECT_ID"),
        "FIREBASE_CLIENT_EMAIL": os.environ.get("FIREBASE_CLIENT_EMAIL"),
        "FIREBASE_PRIVATE_KEY": os.environ.get("FIREBASE_PRIVATE_KEY"),
    }

    missing = [key for key, val in required.items() if not val]
    if missing:
        raise RuntimeError(
            f"Missing Firebase Admin environment variables: {missing}. "
            f"Create a backend/.env file from backend/.env.example and add your Firebase service account credentials. "
            f"Get them from Firebase Console → Project Settings → Service Accounts → Generate new private key."
        )

    private_key = required["FIREBASE_PRIVATE_KEY"].replace("\\n", "\n")

    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": required["FIREBASE_PROJECT_ID"],
        "client_email": required["FIREBASE_CLIENT_EMAIL"],
        "private_key": private_key,
        "token_uri": "https://oauth2.googleapis.com/token",
    })

    _firebase_app = firebase_admin.initialize_app(cred)
    return _firebase_app


def verify_firebase_token(token: str) -> dict:
    """
    Verify a Firebase ID token using the Admin SDK.

    Returns decoded claims dict containing at minimum 'uid' and 'email'.
    Lets any firebase_admin.auth.InvalidIdTokenError (or subclass) propagate
    to the caller, which maps it to HTTP 401.
    """
    _get_app()
    decoded = firebase_auth.verify_id_token(token)
    return decoded
