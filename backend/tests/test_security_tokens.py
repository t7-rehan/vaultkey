"""
Property tests for hash_share_token and generate_secure_token in backend/app/security.py

Feature: firebase-auth-integration
"""
import hashlib
import re

from hypothesis import given, settings
from hypothesis import strategies as st

from app.security import hash_share_token, generate_secure_token


# ---------------------------------------------------------------------------
# Property 8 — hash_share_token is byte-for-byte preserved
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 8: hash_share_token is byte-for-byte preserved

@given(s=st.text())
@settings(max_examples=200)
def test_hash_share_token_preserved(s):
    """
    For any string s, hash_share_token(s) must equal
    hashlib.sha256(s.encode('utf-8')).hexdigest() byte-for-byte.

    Validates: Requirements 6.4
    """
    expected = hashlib.sha256(s.encode('utf-8')).hexdigest()
    assert hash_share_token(s) == expected, (
        f"hash_share_token({s!r}) = {hash_share_token(s)!r}, "
        f"expected {expected!r}"
    )


# ---------------------------------------------------------------------------
# Property 9 — generate_secure_token produces valid URL-safe tokens
# ---------------------------------------------------------------------------
# Feature: firebase-auth-integration, Property 9: generate_secure_token produces valid URL-safe tokens

_URL_SAFE_PATTERN = re.compile(r'^[A-Za-z0-9_-]+$')


@given(call_count=st.integers(min_value=1, max_value=50))
@settings(max_examples=100)
def test_generate_secure_token_url_safe(call_count):
    """
    For any call count N (1–50), each call to generate_secure_token() must
    return a non-empty string that:
      - Contains only URL-safe base64 characters ([A-Za-z0-9_-])
      - Has a minimum length of 32 characters

    Validates: Requirements 6.5
    """
    for _ in range(call_count):
        token = generate_secure_token()

        assert isinstance(token, str) and len(token) > 0, (
            f"generate_secure_token() must return a non-empty string, got {token!r}"
        )
        assert _URL_SAFE_PATTERN.match(token), (
            f"generate_secure_token() returned token with invalid characters: {token!r}"
        )
        assert len(token) >= 32, (
            f"generate_secure_token() returned token shorter than 32 chars: "
            f"{token!r} (length={len(token)})"
        )
