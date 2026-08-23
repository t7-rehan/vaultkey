"""
Unit tests for backend/app/models.py

Feature: firebase-auth-integration
Requirements: 5.1, 5.3
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from app.models import Base, User


@pytest.fixture()
def db_session():
    """Provide an isolated in-memory SQLite session for each test."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


# ---------------------------------------------------------------------------
# Task 3.1 — nullable fields accepted; firebase_uid unique constraint enforced
# ---------------------------------------------------------------------------

def test_user_nullable_hashed_password_and_email_accepted(db_session):
    """
    A User with hashed_password=None and email=None must be insertable
    without raising an IntegrityError, provided firebase_uid is unique.
    Requirements: 5.1, 5.3
    """
    user = User(
        firebase_uid="uid_test",
        email=None,
        hashed_password=None,
    )
    db_session.add(user)
    # Should not raise
    db_session.commit()

    persisted = db_session.query(User).filter_by(firebase_uid="uid_test").first()
    assert persisted is not None
    assert persisted.hashed_password is None
    assert persisted.email is None
    assert persisted.firebase_uid == "uid_test"


def test_duplicate_firebase_uid_raises_integrity_error(db_session):
    """
    Inserting a second User with the same firebase_uid must raise
    an IntegrityError (unique constraint violation).
    Requirements: 5.3
    """
    user1 = User(firebase_uid="uid_test", email=None, hashed_password=None)
    db_session.add(user1)
    db_session.commit()

    user2 = User(firebase_uid="uid_test", email="other@example.com", hashed_password=None)
    db_session.add(user2)
    with pytest.raises(IntegrityError):
        db_session.commit()
