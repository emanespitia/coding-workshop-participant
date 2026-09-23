"""
ORM models for users and engineer profiles.

One `users` table holds every account; `role` decides what it can do.
Engineers additionally have a one-to-one `engineer_profiles` row.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    ARRAY,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import AVAILABILITY, ROLES
from app.core.orm import Base


def _in_list(column: str, values: tuple[str, ...]) -> str:
    """SQL for a CHECK constraint restricting a column to fixed values."""
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class User(Base):
    """An ACME account: employee, engineer or admin."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(_in_list("role", ROLES), name="users_role_check"),
        CheckConstraint("email = lower(email)", name="users_email_lowercase"),
        Index("users_role_idx", "role", postgresql_where=text("is_active")),
    )
    # Fetch server-generated values (ids, timestamps, defaults) right after INSERT/UPDATE.
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    must_change_password: Mapped[bool] = mapped_column(server_default=text("false"))
    # Incremented on password change/reset; tokens carrying an older version are rejected.
    token_version: Mapped[int] = mapped_column(server_default=text("0"))
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Loaded together with the user (LEFT OUTER JOIN); removed when unset or the user is deleted.
    engineer_profile: Mapped[Optional["EngineerProfile"]] = relationship(
        back_populates="user", lazy="joined", cascade="all, delete-orphan", passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email} ({self.role})>"


class EngineerProfile(Base):
    """Engineer-specific details, one per engineer."""

    __tablename__ = "engineer_profiles"
    __table_args__ = (
        CheckConstraint(_in_list("availability", AVAILABILITY), name="engineer_profiles_availability_check"),
        CheckConstraint("cardinality(specialties) >= 1", name="engineer_profiles_specialties_required"),
    )
    __mapper_args__ = {"eager_defaults": True}

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # Issue categories this engineer can work on; at least one.
    specialties: Mapped[list[str]] = mapped_column(ARRAY(Text))
    availability: Mapped[str] = mapped_column(Text, server_default=text("'available'"))
    phone: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="engineer_profile")
