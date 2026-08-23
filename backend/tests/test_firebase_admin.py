"""
Property tests for backend/app/firebase_admin.py

Feature: firebase-auth-integration
"""
import os
import importlib
import sys
import pytest
from unittest.mock import patch, MagicMock
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ALL_ENV_VARS = frozenset([
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
])


def _reset_module():
    """
    Force a fresh import of firebase_admin_module so the module-level
    _firebase_app sentinel is reset to None before each property example.
    """
    mod_name = "app.firebase_admin"
    if mod_name in sys.modules:
        del sys.modules[mod_name]
    import app.firebase_admin as mod
    return mod


# ---------------------------------------------------------------------------
# Property 2 — Missing backend env vars raise RuntimeError
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 2: Missing backend env vars raise RuntimeError

@given(
    missing_vars=st.frozensets(
        st.sampled_from(sorted(ALL_ENV_VARS)),
        min_size=1,
    )
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
def test_get_app_missing_env_vars_raises_runtime_error(missing_vars):
    """
    For every non-empty subset of the three required Firebase env vars,
    removing those vars from the environment must cause _get_app() to raise
    a RuntimeError whose message names every missing variable.
    """
    # Build a clean env that has all three vars present, then remove the subset
    clean_env = {
        "FIREBASE_PROJECT_ID":   "test-project",
        "FIREBASE_CLIENT_EMAIL": "test@test.iam.gserviceaccount.com",
        "FIREBASE_PRIVATE_KEY":  "test-key",
    }
    for var in missing_vars:
        del clean_env[var]

    # Patch os.environ so only our controlled values are visible
    with patch.dict(os.environ, clean_env, clear=True):
        mod = _reset_module()
        with pytest.raises(RuntimeError) as exc_info:
            mod._get_app()

    error_message = str(exc_info.value)
    for var in missing_vars:
        assert var in error_message, (
            f"RuntimeError message should name '{var}', got: {error_message!r}"
        )


# ---------------------------------------------------------------------------
# Property 3 — Valid token claims pass through Token_Verifier
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 3: Valid token claims pass through Token_Verifier

@given(
    uid=st.text(min_size=1, alphabet=st.characters(whitelist_categories=("L", "N"))),
    email=st.emails(),
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_verify_firebase_token_claims_passthrough(uid, email):
    """
    When firebase_admin.auth.verify_id_token returns a claims dict,
    verify_firebase_token must return that dict unchanged — uid and email
    must exactly match the values the SDK returned.
    """
    fake_claims = {"uid": uid, "email": email}

    with patch.dict(
        os.environ,
        {
            "FIREBASE_PROJECT_ID":   "test-project",
            "FIREBASE_CLIENT_EMAIL": "test@test.iam.gserviceaccount.com",
            "FIREBASE_PRIVATE_KEY":  "test-key",
        },
        clear=True,
    ):
        mod = _reset_module()

        # Patch _get_app so initialization is skipped (avoids real SDK calls)
        mock_app = MagicMock()
        mod._firebase_app = mock_app  # simulate already-initialized

        # Patch the SDK's verify_id_token to return our fake claims
        with patch("app.firebase_admin.firebase_auth.verify_id_token", return_value=fake_claims):
            result = mod.verify_firebase_token("any-token-string")

    assert result["uid"] == uid, (
        f"Expected uid={uid!r}, got {result['uid']!r}"
    )
    assert result["email"] == email, (
        f"Expected email={email!r}, got {result['email']!r}"
    )
