"""
SQLAlchemy declarative base shared by every model.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def in_list(column: str, values: tuple[str, ...]) -> str:
    """SQL for a CHECK constraint restricting a column to fixed values."""
    return f"{column} IN ({', '.join(repr(v) for v in values)})"
