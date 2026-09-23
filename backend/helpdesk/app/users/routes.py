"""
User management endpoints.

Admins manage every account. Other users can read and edit a limited set of
fields on their own account (see the *SelfUpdate models).
"""

from app.core.constants import ROLE_ADMIN, ROLE_ENGINEER
from app.core.errors import ForbiddenError, ValidationError
from app.core.http import Request, Response, created, no_content, ok
from app.core.router import Router
from app.core.schemas import parse
from app.users import repository as repo
from app.users import service
from app.users.schemas import (
    AdminUserCreate,
    AdminUserUpdate,
    CreatedUserResponse,
    EngineerSelfUpdate,
    SelfUserUpdate,
    TemporaryPasswordResponse,
    UserListQuery,
    UserListResponse,
    UserResponse,
)

router = Router()

_ADMIN_ONLY_FIELDS = ("email", "role", "is_active")


@router.route("GET", "/users", roles=(ROLE_ADMIN,))
def list_users(req: Request) -> Response:
    """Search users. Query: q, role, is_active, page, page_size."""
    query = parse(UserListQuery, {k: v for k, v in req.query.items() if v != ""})
    items, total = repo.list_users(
        req.db, q=query.q, role=query.role, is_active=query.is_active,
        limit=query.page_size, offset=(query.page - 1) * query.page_size,
    )
    return ok(UserListResponse.model_validate({
        "items": items, "total": total, "page": query.page, "page_size": query.page_size,
    }))


@router.route("POST", "/users", roles=(ROLE_ADMIN,))
def create_user(req: Request) -> Response:
    """Create an account (e.g. an engineer). Returns a one-time temporary password."""
    body = parse(AdminUserCreate, req.body)
    if body.engineer_profile is not None and body.role != ROLE_ENGINEER:
        raise ValidationError({"engineer_profile": "Only engineers have an engineer profile"})

    user, temporary_password = service.create_user(
        req.db, email=body.email, full_name=body.full_name, role=body.role,
        engineer_profile=body.engineer_profile.model_dump(exclude_unset=True) if body.engineer_profile else None,
    )
    return created(CreatedUserResponse.model_validate({"user": user, "temporary_password": temporary_password}))


@router.route("GET", "/users/{id}")
def get_user(req: Request) -> Response:
    """Admins can view any user; others only themselves."""
    user = service.get_user(req.db, req.user, req.path_params["id"])
    return ok(UserResponse.model_validate({"user": user}))


@router.route("PATCH", "/users/{id}")
def update_user(req: Request) -> Response:
    """
    Update a user.

    Admins: email, full_name, role, is_active, engineer_profile.
    Self (non-admin): full_name only; engineers may also set
    engineer_profile.availability and engineer_profile.phone. Sending any other
    field returns 403 FORBIDDEN_FIELD (email/role/is_active) or 400.
    """
    actor = req.user
    if actor.role == ROLE_ADMIN:
        model = AdminUserUpdate
    else:
        forbidden = [f for f in _ADMIN_ONLY_FIELDS if f in req.body]
        if forbidden:
            raise ForbiddenError(f"Only admins can change: {', '.join(forbidden)}", code="FORBIDDEN_FIELD")
        model = EngineerSelfUpdate if actor.role == ROLE_ENGINEER else SelfUserUpdate

    changes = parse(model, req.body).model_dump(exclude_unset=True)
    profile = changes.pop("engineer_profile", None)
    user = service.update_user(req.db, actor, req.path_params["id"], changes, profile)
    return ok(UserResponse.model_validate({"user": user}))


@router.route("DELETE", "/users/{id}", roles=(ROLE_ADMIN,))
def delete_user(req: Request) -> Response:
    """Delete a user without history. Admins cannot delete themselves or the last admin."""
    service.delete_user(req.db, req.user, req.path_params["id"])
    return no_content()


@router.route("POST", "/users/{id}/reset-password", roles=(ROLE_ADMIN,))
def reset_password(req: Request) -> Response:
    """Issue a temporary password; the user must change it at next login."""
    temporary_password = service.reset_password(req.db, req.user, req.path_params["id"])
    return ok(TemporaryPasswordResponse(temporary_password=temporary_password))
