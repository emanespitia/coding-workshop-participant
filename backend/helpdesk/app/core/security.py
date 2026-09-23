"""
Password hashing, password policy and JWT token handling.

Passwords are hashed with scrypt (stdlib, memory-hard) so the Lambda package
has no native dependencies beyond psycopg.
"""

import base64
import hashlib
import hmac
import secrets
import string
import time
from typing import Any, Optional

import jwt

from app.core import config
from app.core.errors import UnauthorizedError

_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128

_JWT_ALGORITHM = "HS256"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    """Hash a password as 'scrypt$N$r$p$salt$hash'."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_DKLEN,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Check a password against a stored hash in constant time."""
    try:
        algorithm, n, r, p, salt, expected = stored_hash.split("$")
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt),
            n=int(n), r=int(r), p=int(p),
            dklen=len(base64.b64decode(expected)),
        )
        return hmac.compare_digest(_b64(digest), expected)
    except (ValueError, TypeError):
        return False


# Precomputed hash used to keep login timing uniform when the email is unknown.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def burn_password_check(password: str) -> None:
    """Spend the same time as a real verification (for unknown accounts)."""
    verify_password(password, _DUMMY_HASH)


def password_policy_error(password: str) -> Optional[str]:
    """Return a human-readable policy violation, or None if the password is acceptable."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters"
    if len(password) > PASSWORD_MAX_LENGTH:
        return f"Password must be at most {PASSWORD_MAX_LENGTH} characters"
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        return "Password must contain at least one letter and one number"
    return None


def generate_temporary_password(length: int = 14) -> str:
    """Generate a random password that satisfies the password policy."""
    alphabet = string.ascii_letters + string.digits
    while True:
        candidate = "".join(secrets.choice(alphabet) for _ in range(length))
        if password_policy_error(candidate) is None:
            return candidate


def _encode(user: Any, token_type: str, ttl: int) -> str:
    now = int(time.time())
    claims = {
        "sub": str(user.id),
        "role": user.role,
        "ver": user.token_version,
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(claims, config.jwt_secret(), algorithm=_JWT_ALGORITHM)


def issue_tokens(user: Any) -> dict:
    """Create an access/refresh token pair for a user."""
    return {
        "access_token": _encode(user, "access", config.ACCESS_TOKEN_TTL_SECONDS),
        "refresh_token": _encode(user, "refresh", config.REFRESH_TOKEN_TTL_SECONDS),
        "token_type": "Bearer",
        "expires_in": config.ACCESS_TOKEN_TTL_SECONDS,
    }


def decode_token(token: str, expected_type: str) -> dict:
    """Validate a JWT and return its claims, raising 401 on any problem."""
    try:
        claims = jwt.decode(
            token, config.jwt_secret(), algorithms=[_JWT_ALGORITHM],
            options={"require": ["sub", "exp", "type", "ver"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token has expired", code="TOKEN_EXPIRED") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid token", code="INVALID_TOKEN") from exc
    if claims.get("type") != expected_type:
        raise UnauthorizedError("Invalid token type", code="INVALID_TOKEN")
    return claims
