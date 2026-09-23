"""Unit tests for password hashing, password policy and JWT handling."""

from types import SimpleNamespace

import pytest

from app.core import security
from app.core.errors import UnauthorizedError

USER = SimpleNamespace(id=7, role="engineer", token_version=3)


def test_hash_roundtrip():
    stored = security.hash_password("Password123")
    assert stored.startswith("scrypt$")
    assert security.verify_password("Password123", stored)
    assert not security.verify_password("Password124", stored)


def test_hashes_are_salted():
    assert security.hash_password("Password123") != security.hash_password("Password123")


@pytest.mark.parametrize("stored", ["", "plain", "bcrypt$1$2$3$4$5", "scrypt$x$8$1$AA==$AA=="])
def test_verify_rejects_malformed_hashes(stored):
    assert security.verify_password("Password123", stored) is False


@pytest.mark.parametrize("password,ok", [
    ("Password123", True),
    ("short1", False),
    ("onlyletters", False),
    ("1234567890", False),
    ("a1" * 65, False),
])
def test_password_policy(password, ok):
    assert (security.password_policy_error(password) is None) is ok


def test_temporary_passwords_meet_policy():
    for _ in range(50):
        assert security.password_policy_error(security.generate_temporary_password()) is None


def test_token_roundtrip():
    tokens = security.issue_tokens(USER)
    claims = security.decode_token(tokens["access_token"], "access")
    assert claims["sub"] == "7"
    assert claims["ver"] == 3
    assert security.decode_token(tokens["refresh_token"], "refresh")["type"] == "refresh"


def test_token_type_is_enforced():
    tokens = security.issue_tokens(USER)
    with pytest.raises(UnauthorizedError):
        security.decode_token(tokens["refresh_token"], "access")


def test_tampered_token_rejected():
    token = security.issue_tokens(USER)["access_token"]
    with pytest.raises(UnauthorizedError) as exc:
        security.decode_token(token[:-2] + ("A" if token[-1] != "A" else "B") * 2, "access")
    assert exc.value.code == "INVALID_TOKEN"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("JWT_SECRET")
    with pytest.raises(RuntimeError):
        security.issue_tokens(USER)
