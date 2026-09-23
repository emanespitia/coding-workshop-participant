"""
Token validation: turns a JWT into the current user row.
FastAPI dependencies built on this live in app.core.deps.
"""

from sqlalchemy.orm import Session

from app.core import security
from app.core.errors import UnauthorizedError
from app.users import repository as users_repo
from app.users.models import User


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
