"""
Database queries for users. Functions take the request's Session and never
commit; the caller owns the transaction.
"""

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import ROLE_ADMIN
from app.users.models import User


def get_user(session: Session, user_id: int, *, for_update: bool = False) -> Optional[User]:
    """
    Fetch a user (with engineer profile) by id.

    With for_update the user row is locked until the transaction ends and the
    object is refreshed from the database even if already in the session.
    """
    query = select(User).where(User.id == user_id)
    if for_update:
        query = query.with_for_update(of=User).execution_options(populate_existing=True)
    return session.scalars(query).unique().one_or_none()


def get_user_by_email(session: Session, email: str) -> Optional[User]:
    """Fetch a user by (lower-cased) email."""
    return session.scalars(select(User).where(User.email == email)).unique().one_or_none()


def email_exists(session: Session, email: str, exclude_id: Optional[int] = None) -> bool:
    """True if another user already uses this email."""
    query = select(User.id).where(User.email == email)
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    return session.scalar(query.limit(1)) is not None


def create_user(session: Session, *, email: str, full_name: str, password_hash: str,
                role: str, must_change_password: bool = False) -> User:
    """Insert a user and return it with server-generated fields populated."""
    user = User(
        email=email, full_name=full_name, password_hash=password_hash, role=role,
        must_change_password=must_change_password, password_changed_at=func.now(),
    )
    session.add(user)
    session.flush()
    return user


def list_users(session: Session, *, q: Optional[str], role: Optional[str], is_active: Optional[bool],
               limit: int, offset: int) -> tuple[list[User], int]:
    """Search users by name/email with optional role and status filters."""
    conditions = []
    if q:
        needle = q.lower()
        conditions.append(
            (func.strpos(func.lower(User.full_name), needle) > 0) | (func.strpos(User.email, needle) > 0)
        )
    if role:
        conditions.append(User.role == role)
    if is_active is not None:
        conditions.append(User.is_active == is_active)

    total = session.scalar(select(func.count()).select_from(User).where(*conditions))
    users = session.scalars(
        select(User).where(*conditions).order_by(User.full_name, User.id).limit(limit).offset(offset)
    ).unique().all()
    return list(users), total


def lock_active_admin_ids(session: Session) -> list[int]:
    """
    Lock every active admin row (in id order) and return their ids.

    Concurrent transactions that also call this block until the first commits,
    so "at least one admin" checks cannot race each other.
    """
    query = (
        select(User.id)
        .where(User.role == ROLE_ADMIN, User.is_active)
        .order_by(User.id)
        .with_for_update()
    )
    return list(session.scalars(query).all())
