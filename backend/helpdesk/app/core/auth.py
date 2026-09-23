"""
Request authentication and centralized role checks.
"""

from sqlalchemy.orm import Session

from app.core import security
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.http import Request
from app.users import repository as users_repo
from app.users.models import User


def bearer_token(req: Request) -> str:
    """Extract the bearer token from the Authorization header."""
    header = req.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise UnauthorizedError("Missing bearer token", code="MISSING_TOKEN")
    return token.strip()


def load_token_user(session: Session, token: str, token_type: str) -> User:
    """
    Validate a token and return the current user row.

    The user's role is always taken from the database, not the token, so role
    changes and deactivation take effect immediately.
    """
    claims = security.decode_token(token, token_type)
    try:
        user_id = int(claims["sub"])
    except (TypeError, ValueError) as exc:
        raise UnauthorizedError("Invalid token", code="INVALID_TOKEN") from exc
    user = users_repo.get_user(session, user_id)
    if user is None or claims["ver"] != user.token_version:
        raise UnauthorizedError("Session is no longer valid, please sign in again", code="SESSION_REVOKED")
    if not user.is_active:
        raise UnauthorizedError("Account is disabled", code="ACCOUNT_DISABLED")
    return user


def authenticate(session: Session, req: Request) -> User:
    """Authenticate the request with its access token."""
    return load_token_user(session, bearer_token(req), "access")


def require_role(user: User, *roles: str) -> None:
    """Raise 403 unless the user has one of the given roles."""
    if user.role not in roles:
        raise ForbiddenError("You do not have permission to perform this action")
