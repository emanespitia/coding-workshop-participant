"""
User management business rules.

Invariants enforced here:
* Admins cannot delete, deactivate or change the role of their own account.
* There is always at least one active admin. All active admin rows are locked
  (in a fixed order, before any other user row) so two concurrent requests
  cannot both remove "the other" admin, and cannot deadlock each other.
"""

from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import security
from app.core.constants import ROLE_ADMIN, ROLE_ENGINEER
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.users import repository as repo
from app.users.models import EngineerProfile, User
from app.users.schemas import NO_SPECIALTY_MESSAGE


def _get_or_404(session: Session, user_id: int, *, for_update: bool = False) -> User:
    user = repo.get_user(session, user_id, for_update=for_update)
    if user is None:
        raise NotFoundError("User not found")
    return user


def _ensure_unique_email(session: Session, email: str, exclude_id: Optional[int] = None) -> None:
    if repo.email_exists(session, email, exclude_id):
        raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN",
                            fields={"email": "Already in use"})


def _lock_admins(session: Session, actor: User) -> list[int]:
    """
    Lock all active admin rows (in id order) and confirm the actor is still one of them.

    Must be called before locking any individual user row so every admin
    operation acquires locks in the same order (no deadlocks).
    """
    admin_ids = repo.lock_active_admin_ids(session)
    if actor.id not in admin_ids:
        raise ForbiddenError("You do not have permission to perform this action")
    return admin_ids


def _ensure_admin_remains(admin_ids: list[int], target: User) -> None:
    """Refuse an action that would remove the last active admin."""
    if target.id in admin_ids and len(admin_ids) <= 1:
        raise ConflictError("There must always be at least one active admin", code="LAST_ADMIN")


def _apply_profile(user: User, fields: dict[str, Any]) -> None:
    """Create the engineer profile if missing and set the given fields."""
    if user.engineer_profile is None:
        user.engineer_profile = EngineerProfile()
    for name, value in fields.items():
        setattr(user.engineer_profile, name, value)


def set_password(session: Session, user: User, password: str, *, must_change: bool) -> None:
    """Replace a password and revoke every existing token for the user."""
    user.password_hash = security.hash_password(password)
    user.must_change_password = must_change
    user.password_changed_at = func.now()
    user.token_version = User.token_version + 1
    session.flush()
    session.refresh(user)


def get_user(session: Session, actor: User, user_id: int) -> User:
    """Admins can view anyone; other users only themselves."""
    if actor.role != ROLE_ADMIN and actor.id != user_id:
        raise ForbiddenError("You can only view your own account")
    return _get_or_404(session, user_id)


def create_user(session: Session, *, email: str, full_name: str, role: str,
                engineer_profile: Optional[dict[str, Any]]) -> tuple[User, str]:
    """Admin creates an account with a one-time temporary password."""
    _ensure_unique_email(session, email)
    temporary_password = security.generate_temporary_password()
    user = repo.create_user(
        session, email=email, full_name=full_name, role=role,
        password_hash=security.hash_password(temporary_password), must_change_password=True,
    )
    if role == ROLE_ENGINEER:
        if not (engineer_profile or {}).get("specialties"):
            raise ValidationError({"engineer_profile.specialties": NO_SPECIALTY_MESSAGE})
        _apply_profile(user, engineer_profile)
    session.flush()
    session.refresh(user)
    return user, temporary_password


def update_user(session: Session, actor: User, user_id: int,
                changes: dict[str, Any], profile_changes: Optional[dict[str, Any]]) -> User:
    """
    Apply changes to a user.

    `changes` may contain email, full_name, role, is_active. The caller has
    already restricted which keys a non-admin may send.
    """
    if actor.role != ROLE_ADMIN and actor.id != user_id:
        raise ForbiddenError("You can only edit your own account")

    admin_ids = _lock_admins(session, actor) if actor.role == ROLE_ADMIN else []
    target = _get_or_404(session, user_id, for_update=True)
    is_self = actor.id == target.id

    # Drop no-op changes so e.g. re-sending the current role is harmless.
    changes = {k: v for k, v in changes.items() if getattr(target, k) != v}

    if is_self and ("role" in changes or changes.get("is_active") is False):
        raise ForbiddenError("You cannot change your own role or deactivate your own account",
                             code="CANNOT_MODIFY_SELF")

    loses_admin = target.role == ROLE_ADMIN and target.is_active and (
        changes.get("role", ROLE_ADMIN) != ROLE_ADMIN or changes.get("is_active") is False
    )
    if loses_admin:
        _ensure_admin_remains(admin_ids, target)

    if "email" in changes:
        _ensure_unique_email(session, changes["email"], exclude_id=target.id)

    new_role = changes.get("role", target.role)
    if profile_changes and new_role != ROLE_ENGINEER:
        raise ValidationError({"engineer_profile": "Only engineers have an engineer profile"})

    if new_role == ROLE_ENGINEER:
        # Engineers must always have at least one specialty, including right after promotion.
        current = target.engineer_profile.specialties if target.engineer_profile else []
        if not (profile_changes or {}).get("specialties", current):
            raise ValidationError({"engineer_profile.specialties": NO_SPECIALTY_MESSAGE})

    for name, value in changes.items():
        setattr(target, name, value)
    if new_role == ROLE_ENGINEER:
        _apply_profile(target, profile_changes or {})
    else:
        target.engineer_profile = None  # delete-orphan removes any existing profile

    session.flush()
    session.refresh(target)
    return target


def delete_user(session: Session, actor: User, user_id: int) -> None:
    """Hard-delete a user who has no history; otherwise ask to deactivate."""
    admin_ids = _lock_admins(session, actor)
    target = _get_or_404(session, user_id, for_update=True)
    if actor.id == target.id:
        raise ForbiddenError("You cannot delete your own account", code="CANNOT_MODIFY_SELF")
    _ensure_admin_remains(admin_ids, target)
    try:
        with session.begin_nested():
            session.delete(target)
    except IntegrityError as exc:
        raise ConflictError(
            "This user has related records and cannot be deleted; deactivate the account instead",
            code="USER_HAS_HISTORY",
        ) from exc


def reset_password(session: Session, actor: User, user_id: int) -> str:
    """Admin sets a temporary password; the user must change it on next login."""
    target = _get_or_404(session, user_id, for_update=True)
    if actor.id == target.id:
        raise ValidationError({"id": "Use change password for your own account"})
    temporary_password = security.generate_temporary_password()
    set_password(session, target, temporary_password, must_change=True)
    return temporary_password
