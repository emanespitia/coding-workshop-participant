"""
Authentication endpoints: register, login, token refresh, current user, change password.
"""

from fastapi import APIRouter, status
from sqlalchemy import func

from app.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    SessionResponse,
)
from app.core import security
from app.core.auth import load_token_user
from app.core.constants import ROLE_EMPLOYEE
from app.core.deps import DbSession, PendingUser
from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError, ValidationError
from app.users import repository as users_repo
from app.users import service as users_service
from app.users.models import User
from app.users.schemas import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _session(user: User) -> dict:
    return {"user": user, "tokens": security.issue_tokens(user)}


@router.post("/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: DbSession) -> dict:
    """Self-service sign-up with an @acme.inc email. Always creates an employee account."""
    if users_repo.email_exists(db, body.email):
        raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN",
                            fields={"email": "Already in use"})
    user = users_repo.create_user(
        db, email=body.email, full_name=body.full_name, role=ROLE_EMPLOYEE,
        password_hash=security.hash_password(body.password),
    )
    user.last_login_at = func.now()
    db.flush()
    db.refresh(user)
    return _session(user)


@router.post("/login", response_model=SessionResponse)
def login(body: LoginRequest, db: DbSession) -> dict:
    """Exchange email and password for an access/refresh token pair."""
    user = users_repo.get_user_by_email(db, body.email)
    if user is None:
        security.burn_password_check(body.password)
        raise UnauthorizedError("Invalid email or password", code="INVALID_CREDENTIALS")
    if not security.verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Invalid email or password", code="INVALID_CREDENTIALS")
    if not user.is_active:
        raise ForbiddenError("This account has been disabled. Contact a facility admin.",
                             code="ACCOUNT_DISABLED")
    user.last_login_at = func.now()
    db.flush()
    db.refresh(user)
    return _session(user)


@router.post("/refresh", response_model=SessionResponse)
def refresh(body: RefreshRequest, db: DbSession) -> dict:
    """Exchange a refresh token for a new token pair."""
    return _session(load_token_user(db, body.refresh_token, "refresh"))


@router.get("/me", response_model=UserResponse)
def me(user: PendingUser) -> dict:
    """The signed-in user. Works even while a password change is pending."""
    return {"user": user}


@router.put("/password", response_model=SessionResponse)
def change_password(body: ChangePasswordRequest, db: DbSession, user: PendingUser) -> dict:
    """
    Change your own password.

    All other sessions are signed out; fresh tokens for this session are returned.
    """
    if not security.verify_password(body.current_password, user.password_hash):
        raise ValidationError({"current_password": "Current password is incorrect"})
    if body.current_password == body.new_password:
        raise ValidationError({"new_password": "New password must be different from the current one"})
    users_service.set_password(db, user, body.new_password, must_change=False)
    return _session(user)
