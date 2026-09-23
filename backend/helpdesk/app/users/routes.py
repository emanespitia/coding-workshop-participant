"""
User management endpoints.

Admins manage every account. Other users can read and edit a limited set of
fields on their own account (see the *SelfUpdate models).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Query, Response, status

from app.core.constants import ROLE_ADMIN, ROLE_ENGINEER
from app.core.deps import AdminUser, CurrentUser, DbSession
from app.core.errors import ForbiddenError, ValidationError
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

router = APIRouter(prefix="/users", tags=["users"])

_ADMIN_ONLY_FIELDS = ("email", "role", "is_active")

# PATCH accepts a different model depending on the caller, so the body is parsed
# by hand; document the admin variant (the superset) in the OpenAPI spec.
_PATCH_DOCS = {"requestBody": {"required": True, "content": {"application/json": {
    "schema": AdminUserUpdate.model_json_schema(ref_template="#/components/schemas/{model}"),
}}}}


@router.get("", response_model=UserListResponse)
def list_users(query: Annotated[UserListQuery, Query()], db: DbSession, _: AdminUser) -> dict:
    """Search users by name/email, filter by role and status. **Admin only.**"""
    items, total = repo.list_users(
        db, q=query.q, role=query.role, is_active=query.is_active,
        limit=query.page_size, offset=(query.page - 1) * query.page_size,
    )
    return {"items": items, "total": total, "page": query.page, "page_size": query.page_size}


@router.post("", response_model=CreatedUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(body: AdminUserCreate, db: DbSession, _: AdminUser) -> dict:
    """
    Create an account (e.g. an engineer). **Admin only.**

    Returns a one-time temporary password; the user must change it at first login.
    Engineers need at least one specialty.
    """
    if body.engineer_profile is not None and body.role != ROLE_ENGINEER:
        raise ValidationError({"engineer_profile": "Only engineers have an engineer profile"})
    user, temporary_password = service.create_user(
        db, email=body.email, full_name=body.full_name, role=body.role,
        engineer_profile=body.engineer_profile.model_dump(exclude_unset=True) if body.engineer_profile else None,
    )
    return {"user": user, "temporary_password": temporary_password}


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: DbSession, actor: CurrentUser) -> dict:
    """A user. Admins can view anyone; others only themselves."""
    return {"user": service.get_user(db, actor, user_id)}


@router.patch("/{user_id}", response_model=UserResponse, openapi_extra=_PATCH_DOCS)
def update_user(user_id: int, body: Annotated[dict[str, Any], Body()], db: DbSession,
                actor: CurrentUser) -> dict:
    """
    Update a user.

    * **Admins:** email, full_name, role, is_active, engineer_profile.
    * **Yourself (non-admin):** full_name only; engineers may also set
      engineer_profile.availability and engineer_profile.phone.

    Sending email/role/is_active as a non-admin returns 403 FORBIDDEN_FIELD.
    """
    if actor.role == ROLE_ADMIN:
        model = AdminUserUpdate
    else:
        forbidden = [f for f in _ADMIN_ONLY_FIELDS if f in body]
        if forbidden:
            raise ForbiddenError(f"Only admins can change: {', '.join(forbidden)}", code="FORBIDDEN_FIELD")
        model = EngineerSelfUpdate if actor.role == ROLE_ENGINEER else SelfUserUpdate

    changes = parse(model, body).model_dump(exclude_unset=True)
    profile = changes.pop("engineer_profile", None)
    return {"user": service.update_user(db, actor, user_id, changes, profile)}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_user(user_id: int, db: DbSession, admin: AdminUser) -> None:
    """
    Delete a user with no history. **Admin only.**

    You cannot delete yourself or the last active admin; users with history
    must be deactivated instead (409 USER_HAS_HISTORY).
    """
    service.delete_user(db, admin, user_id)


@router.post("/{user_id}/reset-password", response_model=TemporaryPasswordResponse)
def reset_password(user_id: int, db: DbSession, admin: AdminUser) -> dict:
    """Issue a temporary password; the user must change it at next login. **Admin only.**"""
    return {"temporary_password": service.reset_password(db, admin, user_id)}
