"""
Authentication endpoints: register, login, token refresh, current user, change password.
"""

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
from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError, ValidationError
from app.core.http import Request, Response, created, ok
from app.core.router import Router
from app.core.schemas import parse
from app.users import repository as users_repo
from app.users import service as users_service
from app.users.models import User
from app.users.schemas import UserResponse

router = Router()


def _session(user: User) -> SessionResponse:
    return SessionResponse.model_validate({"user": user, "tokens": security.issue_tokens(user)})


@router.route("POST", "/auth/register", public=True)
def register(req: Request) -> Response:
    """Self-service sign-up. Always creates an employee account."""
    body = parse(RegisterRequest, req.body)
    if users_repo.email_exists(req.db, body.email):
        raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN",
                            fields={"email": "Already in use"})
    user = users_repo.create_user(
        req.db, email=body.email, full_name=body.full_name, role=ROLE_EMPLOYEE,
        password_hash=security.hash_password(body.password),
    )
    user.last_login_at = func.now()
    req.db.flush()
    req.db.refresh(user)
    return created(_session(user))


@router.route("POST", "/auth/login", public=True)
def login(req: Request) -> Response:
    """Exchange email and password for tokens."""
    body = parse(LoginRequest, req.body)
    user = users_repo.get_user_by_email(req.db, body.email)
    if user is None:
        security.burn_password_check(body.password)
        raise UnauthorizedError("Invalid email or password", code="INVALID_CREDENTIALS")
    if not security.verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Invalid email or password", code="INVALID_CREDENTIALS")
    if not user.is_active:
        raise ForbiddenError("This account has been disabled. Contact a facility admin.",
                             code="ACCOUNT_DISABLED")

    user.last_login_at = func.now()
    req.db.flush()
    req.db.refresh(user)
    return ok(_session(user))


@router.route("POST", "/auth/refresh", public=True)
def refresh(req: Request) -> Response:
    """Exchange a refresh token for a new token pair."""
    body = parse(RefreshRequest, req.body)
    return ok(_session(load_token_user(req.db, body.refresh_token, "refresh")))


@router.route("GET", "/auth/me", allow_password_change_pending=True)
def me(req: Request) -> Response:
    """Return the signed-in user."""
    return ok(UserResponse.model_validate({"user": req.user}))


@router.route("PUT", "/auth/password", allow_password_change_pending=True)
def change_password(req: Request) -> Response:
    """
    Change the signed-in user's password.

    All other sessions are revoked; fresh tokens for this session are returned.
    """
    body = parse(ChangePasswordRequest, req.body)
    if not security.verify_password(body.current_password, req.user.password_hash):
        raise ValidationError({"current_password": "Current password is incorrect"})
    if body.current_password == body.new_password:
        raise ValidationError({"new_password": "New password must be different from the current one"})

    users_service.set_password(req.db, req.user, body.new_password, must_change=False)
    return ok(_session(req.user))
