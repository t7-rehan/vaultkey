"""
Property tests for backend/app/security.py

Feature: firebase-auth-integration
Requirements: 3.2, 4.1, 4.4
"""
import os
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st
from fastapi.testclient import TestClient
from fastapi import Depends

# ---------------------------------------------------------------------------
# Environment setup — patch Firebase env vars before any app import so that
# firebase_admin._get_app() does not raise RuntimeError at import time.
# We also patch firebase_admin.initialize_app to avoid a real SDK call.
# ---------------------------------------------------------------------------

_FAKE_ENV = {
    "FIREBASE_PROJECT_ID":   "test-project",
    "FIREBASE_CLIENT_EMAIL": "test@test.iam.gserviceaccount.com",
    "FIREBASE_PRIVATE_KEY":  "test-key",
}


def _make_test_client():
    """
    Build a FastAPI TestClient with firebase_admin.initialize_app mocked so
    that the module can be imported without real Firebase credentials.
    """
    with patch.dict(os.environ, _FAKE_ENV):
        with patch("firebase_admin.initialize_app", return_value=MagicMock()):
            from app.main import app
            return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Property 4 — Invalid tokens always produce HTTP 401
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 4: Invalid tokens always produce HTTP 401

@given(
    # HTTP header values must be ASCII-printable; restrict to printable ASCII chars
    token=st.text(alphabet=st.characters(min_codepoint=32, max_codepoint=126))
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow], deadline=None)
def test_invalid_token_always_returns_401(token):
    """
    For any ASCII-printable token string, when verify_firebase_token raises an
    Exception, GET /api/auth/me must respond with HTTP 401.

    Validates: Requirements 3.2
    """
    client = _make_test_client()
    # Patch at the point where security.py imported it
    with patch("app.security.verify_firebase_token", side_effect=Exception("bad token")):
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 401, (
        f"Expected 401 for token={token!r}, got {response.status_code}"
    )


def test_missing_authorization_header_returns_401():
    """
    A request with no Authorization header must return HTTP 401.

    Validates: Requirements 3.3
    """
    client = _make_test_client()
    response = client.get("/api/auth/me")
    assert response.status_code == 401, (
        f"Expected 401 for missing Authorization header, got {response.status_code}"
    )


def test_non_bearer_scheme_returns_401():
    """
    A request using a non-Bearer scheme (e.g. Basic) must return HTTP 401.

    Validates: Requirements 3.3
    """
    client = _make_test_client()
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Basic abc123"},
    )
    assert response.status_code == 401, (
        f"Expected 401 for Basic auth scheme, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Helpers for Property 5
# ---------------------------------------------------------------------------

def _make_in_memory_db():
    """Return a fresh in-memory SQLite engine + session + tables."""
    from app.models import Base
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return engine, Session


def _call_get_current_user(db, firebase_uid: str, email: str = "test@test.com"):
    """
    Call security.get_current_user() directly by constructing the dependency
    arguments manually (bypassing FastAPI DI).

    Patches app.security.verify_firebase_token — the name as imported in the
    security module — so the mock is active at call time regardless of the
    firebase_admin module's internal state.
    """
    from app.security import get_current_user
    from fastapi.security import HTTPAuthorizationCredentials

    fake_credentials = HTTPAuthorizationCredentials(scheme="bearer", credentials="any-token")
    fake_claims = {"uid": firebase_uid, "email": email}

    # Patch at the location where security.py bound the name on import
    with patch("app.security.verify_firebase_token", return_value=fake_claims):
        return get_current_user(credentials=fake_credentials, db=db)


# ---------------------------------------------------------------------------
# Property 5 — Existing user returned without duplication
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 5: Existing user returned without duplication

@given(
    uid=st.text(
        min_size=1,
        alphabet=st.characters(whitelist_categories=("L", "N")),
    )
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow], deadline=None)
def test_existing_user_returned_without_duplication(uid):
    """
    When a User with the given firebase_uid already exists in the DB,
    calling get_current_user() twice with the same firebase_uid must:
      1. Return the same user id both times.
      2. Leave exactly one User row with that firebase_uid in the DB.

    Validates: Requirements 4.1, 4.4
    """
    from app.models import Base, User

    engine, Session = _make_in_memory_db()
    db = Session()

    try:
        # Pre-seed an existing user with the given firebase_uid
        existing = User(firebase_uid=uid, email="seed@test.com", hashed_password=None)
        db.add(existing)
        db.commit()
        db.refresh(existing)
        seeded_id = existing.id

        # First call — should return the existing user
        result1 = _call_get_current_user(db, uid)
        # Second call — must still return the same user, no new row inserted
        result2 = _call_get_current_user(db, uid)

        # Both calls must return the seeded user id
        assert result1.id == seeded_id, (
            f"First call returned id={result1.id!r}, expected {seeded_id!r}"
        )
        assert result2.id == seeded_id, (
            f"Second call returned id={result2.id!r}, expected {seeded_id!r}"
        )

        # Exactly one record with this firebase_uid must exist
        count = db.query(User).filter(User.firebase_uid == uid).count()
        assert count == 1, (
            f"Expected 1 user with firebase_uid={uid!r}, found {count}"
        )
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
