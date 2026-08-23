"""
Unit tests for backend/app/routes/auth.py

Verifies that:
- POST /api/auth/register is removed (404 or 405)
- POST /api/auth/login is removed (404 or 405)
- GET /api/auth/me with no auth returns 401
- GET /api/auth/me with a valid (mocked) Firebase token returns 200 + user data

Feature: firebase-auth-integration
Requirements: 6.1, 6.2, 6.3
"""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Fake Firebase env vars so firebase_admin.py doesn't raise RuntimeError
# when the app module is imported.
# ---------------------------------------------------------------------------
_FAKE_ENV = {
    "FIREBASE_PROJECT_ID": "test-project",
    "FIREBASE_CLIENT_EMAIL": "test@test.iam.gserviceaccount.com",
    "FIREBASE_PRIVATE_KEY": "test-key",
}


@pytest.fixture(scope="module")
def client():
    """
    Create a FastAPI TestClient with Firebase Admin env vars patched so that
    importing app.main doesn't trigger a RuntimeError from missing env vars.
    """
    with patch.dict(os.environ, _FAKE_ENV):
        # Also patch firebase_admin.initialize_app so it never actually
        # contacts Firebase services during tests.
        with patch("firebase_admin.initialize_app", return_value=MagicMock()):
            from app.main import app
            with TestClient(app, raise_server_exceptions=False) as c:
                yield c, app


# ---------------------------------------------------------------------------
# Test 1: POST /api/auth/register should return 404 or 405
# ---------------------------------------------------------------------------

def test_register_route_not_found(client):
    """
    POST /api/auth/register must not exist — the route was removed as part of
    the Firebase auth migration.
    Requirements: 6.1
    """
    test_client, _ = client
    response = test_client.post("/api/auth/register", json={"email": "a@b.com", "password": "pw"})
    assert response.status_code in (404, 405), (
        f"Expected 404 or 405 for removed /register endpoint, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 2: POST /api/auth/login should return 404 or 405
# ---------------------------------------------------------------------------

def test_login_route_not_found(client):
    """
    POST /api/auth/login must not exist — the route was removed as part of
    the Firebase auth migration.
    Requirements: 6.2
    """
    test_client, _ = client
    response = test_client.post("/api/auth/login", json={"email": "a@b.com", "password": "pw"})
    assert response.status_code in (404, 405), (
        f"Expected 404 or 405 for removed /login endpoint, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 3: GET /api/auth/me with no Authorization header → 401
# ---------------------------------------------------------------------------

def test_me_without_auth_returns_401(client):
    """
    GET /api/auth/me with no Authorization header must return HTTP 401.
    Requirements: 6.3, 3.3
    """
    test_client, _ = client
    response = test_client.get("/api/auth/me")
    assert response.status_code == 401, (
        f"Expected 401 for unauthenticated /me request, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 4: GET /api/auth/me with a valid mocked Firebase token → 200 + user data
# ---------------------------------------------------------------------------

def test_me_with_valid_firebase_token_returns_user(client):
    """
    GET /api/auth/me with a mocked valid Firebase token must return 200 and a
    response body that contains 'id' and 'email'.

    Strategy: override the get_current_user dependency in the FastAPI app to
    bypass Firebase entirely and return a deterministic fake User object.
    Requirements: 6.3, 3.1
    """
    from datetime import datetime
    from app.security import get_current_user

    test_client, app = client

    # Build a fake User that mirrors the shape expected by UserResponse
    fake_user = MagicMock()
    fake_user.id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    fake_user.email = "user@test.com"
    fake_user.firebase_uid = "test-uid-123"
    fake_user.hashed_password = None
    fake_user.created_at = datetime(2024, 1, 1, 0, 0, 0)
    fake_user.updated_at = None

    def override_get_current_user():
        return fake_user

    # Inject the override
    app.dependency_overrides[get_current_user] = override_get_current_user

    try:
        response = test_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer fake-firebase-token"},
        )
        assert response.status_code == 200, (
            f"Expected 200 for authenticated /me request, got {response.status_code}: {response.text}"
        )
        body = response.json()
        assert "id" in body, f"Response missing 'id' field: {body}"
        assert "email" in body, f"Response missing 'email' field: {body}"
        assert body["email"] == "user@test.com"
        assert body["id"] == "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    finally:
        # Always clean up the override so other tests aren't affected
        app.dependency_overrides.pop(get_current_user, None)
