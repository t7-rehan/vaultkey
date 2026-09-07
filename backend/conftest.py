"""
Pytest configuration and shared fixtures for VaultKey backend tests.
"""
import os
import pytest
from pathlib import Path

# Load test environment variables before importing the app
@pytest.fixture(scope="session", autouse=True)
def load_test_env():
    """
    Load .env.test file before any tests run.
    This prevents tests from requiring a live production database.
    """
    env_test_file = Path(__file__).parent / ".env.test"
    
    if env_test_file.exists():
        from dotenv import load_dotenv
        load_dotenv(env_test_file)
    else:
        # Set minimal test environment if .env.test doesn't exist
        os.environ.setdefault("JWT_SECRET", "test_jwt_secret_key_for_testing_only_not_production")
        os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
        os.environ.setdefault("R2_ACCOUNT_ID", "test_account")
        os.environ.setdefault("R2_BUCKET_NAME", "test_bucket")
        os.environ.setdefault("R2_ACCESS_KEY_ID", "test_key")
        os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test_secret")
