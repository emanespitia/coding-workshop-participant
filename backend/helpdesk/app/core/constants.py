"""
Domain enumerations shared across modules. Keep in sync with CHECK constraints in schema.sql.

Defined as Literal types so Pydantic validates them and plain strings flow
through to PostgreSQL unchanged.
"""

from typing import Literal, get_args

Role = Literal["employee", "engineer", "admin"]
ROLES: tuple[str, ...] = get_args(Role)
ROLE_EMPLOYEE, ROLE_ENGINEER, ROLE_ADMIN = ROLES

Availability = Literal["available", "busy", "off_duty"]
AVAILABILITY: tuple[str, ...] = get_args(Availability)

Category = Literal[
    "hvac",
    "electrical",
    "plumbing",
    "network",
    "it_hardware",
    "av_equipment",
    "furniture",
    "cleaning",
    "security",
    "access_control",
    "other",
]
CATEGORIES: tuple[str, ...] = get_args(Category)
