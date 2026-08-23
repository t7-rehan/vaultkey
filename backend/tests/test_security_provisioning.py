"""
Property tests for backend/app/security.py — user provisioning via Firebase auth.

Feature: firebase-auth-integration
Requirements: 4.2, 4.5, 5.5, 15.4
"""
import re
import pytest
from unittest.mock import patch, MagicMock
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st

from app.models import Base, User
from app.security import get_current_user

# UUID v4 pattern
UUID_V4_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


# ---------------------------------------------------------------------------
# Shared fixture helpers — used inline inside each @given test
# ---------------------------------------------------------------------------

def _make_db_session():
    """Create an isolated in-memory SQLite session with all tables."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    return session, engine


def _make_credentials(token: str = "mock-firebase-token") -> HTTPAuthorizationCredentials:
    """Build a mock HTTPAuthorizationCredentials with Bearer scheme."""
    creds = MagicMock(spec=HTTPAuthorizationCredentials)
    creds.scheme = "bearer"
    creds.credentials = token
    return creds


# ---------------------------------------------------------------------------
# Property 6 — New user provisioned with correct fields
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 6: New user provisioned with correct fields

@given(
    firebase_uid=st.text(
        min_size=1,
        alphabet=st.characters(whitelist_categories=("L", "N")),
    ),
    email=st.emails(),
)
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
    deadline=None,
)
def test_new_user_provisioned_with_correct_fields(firebase_uid, email):
    """
    For any (firebase_uid, email) pair not already in the database, calling
    get_current_user() must create exactly one User record with:
      - firebase_uid == input firebase_uid
      - email        == input email
      - hashed_password is None
      - id           matches UUID v4 format

    Validates: Requirements 4.2, 5.5
    """
    session, engine = _make_db_session()

    try:
        # Guarantee the uid is NOT pre-existing
        pre_existing = session.query(User).filter(User.firebase_uid == firebase_uid).first()
        assert pre_existing is None, "Test setup error: uid already present"

        fake_decoded = {"uid": firebase_uid, "email": email}
        credentials = _make_credentials()

        with patch("app.security.verify_firebase_token", return_value=fake_decoded):
            created_user = get_current_user(credentials=credentials, db=session)

        # --- assertions ---
        assert created_user.firebase_uid == firebase_uid, (
            f"Expected firebase_uid={firebase_uid!r}, got {created_user.firebase_uid!r}"
        )
        assert created_user.email == email, (
            f"Expected email={email!r}, got {created_user.email!r}"
        )
        assert created_user.hashed_password is None, (
            f"Expected hashed_password=None, got {created_user.hashed_password!r}"
        )
        assert UUID_V4_PATTERN.match(created_user.id), (
            f"User.id {created_user.id!r} does not match UUID v4 pattern"
        )
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


# ---------------------------------------------------------------------------
# Property 7 — All authenticated requests return User with UUID id
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 7: All authenticated requests return User with UUID id

@given(
    uid=st.text(
        min_size=1,
        alphabet=st.characters(whitelist_categories=("L", "N")),
    ),
)
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
    deadline=None,
)
def test_authenticated_request_returns_user_with_uuid_id(uid):
    """
    For any valid firebase uid, get_current_user() must return a User whose
    .id field conforms to UUID v4 format regardless of whether the user was
    freshly created or already existed.

    Validates: Requirements 4.5, 15.4
    """
    session, engine = _make_db_session()

    try:
        fake_decoded = {"uid": uid, "email": "test@example.com"}
        credentials = _make_credentials()

        with patch("app.security.verify_firebase_token", return_value=fake_decoded):
            user = get_current_user(credentials=credentials, db=session)

        assert UUID_V4_PATTERN.match(user.id), (
            f"User.id {user.id!r} does not match UUID v4 pattern"
        )
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
