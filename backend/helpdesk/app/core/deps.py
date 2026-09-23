"""
FastAPI dependencies shared by every router: the request's database session,
the authenticated user, and role checks.

Usage in a route:
    def handler(db: DbSession, user: CurrentUser): ...
    def admin_only(db: DbSession, admin: AdminUser): ...
"""

from typing import Annotated, Callable, Iterator, Optional

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import db
from app.core.auth import load_token_user
from app.core.constants import ROLE_ADMIN
from app.core.errors import ForbiddenError, UnauthorizedError
from app.users.models import User


def get_db() -> Iterator[Session]:
    """
    One session and transaction per request.

    Used with scope="function" so the commit happens right after the endpoint
    returns and *before* the response is sent; any error rolls everything back.
    """
    with db.session_scope() as session:
        yield session


DbSession = Annotated[Session, Depends(get_db, scope="function")]

# auto_error=False: we raise our own 401 with the standard error body.
_bearer = HTTPBearer(auto_error=False, description="Paste `tokens.access_token` from POST /auth/login")


def get_user_allow_pending(
    session: DbSession,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer)],
) -> User:
    """The signed-in user, even if they still must change their password."""
    if credentials is None:
        raise UnauthorizedError("Missing bearer token", code="MISSING_TOKEN")
    return load_token_user(session, credentials.credentials, "access")


def get_current_user(user: Annotated[User, Depends(get_user_allow_pending)]) -> User:
    """The signed-in user; blocked until a required password change is done."""
    if user.must_change_password:
        raise ForbiddenError("You must change your password before continuing", code="PASSWORD_CHANGE_REQUIRED")
    return user


def require_roles(*roles: str) -> Callable[[User], User]:
    """Build a dependency that allows only users with one of the given roles."""
    def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise ForbiddenError("You do not have permission to perform this action")
        return user

    return dependency


PendingUser = Annotated[User, Depends(get_user_allow_pending)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_roles(ROLE_ADMIN))]
