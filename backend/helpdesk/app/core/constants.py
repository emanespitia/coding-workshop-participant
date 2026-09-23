"""
Domain enumerations shared across modules. The models' CHECK constraints are built from these.

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

Priority = Literal["low", "medium", "high", "critical"]
PRIORITIES: tuple[str, ...] = get_args(Priority)

Status = Literal["open", "in_progress", "blocked", "resolved", "closed"]
STATUSES: tuple[str, ...] = get_args(Status)
STATUS_OPEN, STATUS_IN_PROGRESS, STATUS_BLOCKED, STATUS_RESOLVED, STATUS_CLOSED = STATUSES
# Statuses in which someone still has work to do.
ACTIVE_STATUSES = (STATUS_OPEN, STATUS_IN_PROGRESS, STATUS_BLOCKED)

RequestStatus = Literal["pending", "approved", "rejected", "withdrawn"]
REQUEST_STATUSES: tuple[str, ...] = get_args(RequestStatus)

EventType = Literal[
    "created",
    "updated",
    "status_changed",
    "assigned",
    "unassigned",
    "priority_changed",
    "escalated",
    "deescalated",
    "assignment_requested",
    "assignment_rejected",
]
EVENT_TYPES: tuple[str, ...] = get_args(EventType)
