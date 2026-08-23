import os
import secrets
import hashlib
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from passlib.context import CryptContext
from .database import get_db
from .firebase_admin import verify_firebase_token

http_bearer = HTTPBearer(auto_error=False)

# Password context used ONLY for optional share-link passwords (not user auth)
_share_pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_share_token(token: str) -> str:
    """Hash the raw share token using SHA-256 for secure database lookup."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def generate_secure_token() -> str:
    """Generate a high-entropy cryptographically secure random share token."""
    return secrets.token_urlsafe(32)


def hash_password(password: str) -> str:
    """Hash a share-link password for storage."""
    return _share_pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a share-link password against its stored hash."""
    return _share_pwd_context.verify(plain_password, hashed_password)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: Session = Depends(get_db),
):
    """
    FastAPI dependency that verifies a Firebase ID token from the Authorization
    header and returns (or provisions) the corresponding Local_User record.
    """
    from .models import User

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
        if email:
            user = db.query(User).filter(User.email == email).first()
            if user:
                user.firebase_uid = firebase_uid
                db.commit()
                db.refresh(user)
                return user

        user = User(firebase_uid=firebase_uid, email=email)
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            # Race condition or existing email record: retrieve existing user record
            db.rollback()
            user = db.query(User).filter(
                (User.firebase_uid == firebase_uid) | (User.email == email)
            ).first()

    return user
