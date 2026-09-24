"""
Incident workflow and permission rules, as plain data and functions.

Nothing here touches the database, so the rules are easy to read and unit test.

    Open ──► In Progress ◄──► Blocked
     │           │    ▲
     │           ▼    │ (admin reopens)
     │        Resolved
     │           │
     └─────────► Closed ◄── (admin can close In Progress / Blocked too)
"""

from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import and_, or_, true

from app.core.constants import (
    ACTIVE_STATUSES,
    ROLE_ADMIN,
    ROLE_ENGINEER,
    STATUS_BLOCKED,
    STATUS_CLOSED,
    STATUS_IN_PROGRESS,
    STATUS_OPEN,
    STATUS_RESOLVED,
)

# How a user relates to an incident.
ADMIN = "admin"
ASSIGNEE = "assignee"
REPORTER = "reporter"


@dataclass(frozen=True)
class Rule:
    """Who may make a status change and what it requires."""

    allowed: tuple[str, ...]
    requires_comment: Optional[str] = None  # message shown when the comment is missing
    requires_assignee: bool = False


_REASON = "A reason is required"

TRANSITIONS: dict[tuple[str, str], Rule] = {
    (STATUS_OPEN, STATUS_IN_PROGRESS): Rule((ASSIGNEE, ADMIN), requires_assignee=True),
    (STATUS_OPEN, STATUS_CLOSED): Rule((REPORTER, ADMIN), requires_comment=_REASON),
    (STATUS_IN_PROGRESS, STATUS_BLOCKED): Rule((ASSIGNEE, ADMIN), requires_comment=_REASON),
    (STATUS_BLOCKED, STATUS_IN_PROGRESS): Rule((ASSIGNEE, ADMIN)),
    (STATUS_IN_PROGRESS, STATUS_RESOLVED): Rule((ASSIGNEE, ADMIN), requires_comment="A resolution note is required"),
    (STATUS_RESOLVED, STATUS_CLOSED): Rule((ADMIN,)),
    (STATUS_RESOLVED, STATUS_IN_PROGRESS): Rule((ADMIN,), requires_comment=_REASON),
    (STATUS_IN_PROGRESS, STATUS_CLOSED): Rule((ADMIN,), requires_comment=_REASON),
    (STATUS_BLOCKED, STATUS_CLOSED): Rule((ADMIN,), requires_comment=_REASON),
}


def relations(user: Any, incident: Any) -> set[str]:
    """How the user relates to the incident: admin, assignee and/or reporter."""
    result = set()
    if user.role == ROLE_ADMIN:
        result.add(ADMIN)
    if incident.assignee_id is not None and incident.assignee_id == user.id:
        result.add(ASSIGNEE)
    if incident.reporter_id == user.id:
        result.add(REPORTER)
    return result


def allowed_transitions(user: Any, incident: Any) -> list[str]:
    """Statuses this user may move the incident to right now."""
    rels = relations(user, incident)
    return [
        to for (frm, to), rule in TRANSITIONS.items()
        if frm == incident.status
        and rels.intersection(rule.allowed)
        and (not rule.requires_assignee or incident.assignee_id is not None)
    ]


def can_view(user: Any, incident: Any) -> bool:
    """Admins see everything; engineers see their own work and the open, unassigned pool;
    employees see what they reported."""
    if user.role == ROLE_ADMIN:
        return True
    if incident.reporter_id == user.id:
        return True
    if user.role == ROLE_ENGINEER:
        return incident.assignee_id == user.id or (
            incident.assignee_id is None and incident.status == STATUS_OPEN
        )
    return False


def visibility_condition(user: Any, incident_model: Any) -> Any:
    """The same rule as can_view(), as a SQL condition for list queries."""
    if user.role == ROLE_ADMIN:
        return true()
    mine = incident_model.reporter_id == user.id
    if user.role == ROLE_ENGINEER:
        return or_(
            mine,
            incident_model.assignee_id == user.id,
            and_(incident_model.assignee_id.is_(None), incident_model.status == STATUS_OPEN),
        )
    return mine


def is_participant(user: Any, incident: Any) -> bool:
    """Reporter, assignee or admin: the people who take part in the conversation."""
    return bool(relations(user, incident))


def can_edit(user: Any, incident: Any) -> bool:
    """Admins can edit until closed; reporters only while nobody has started work."""
    if incident.status == STATUS_CLOSED:
        return False
    if user.role == ROLE_ADMIN:
        return True
    return incident.reporter_id == user.id and incident.status == STATUS_OPEN


def can_escalate(user: Any, incident: Any) -> bool:
    """Reporters and admins can flag an active incident for attention (once)."""
    return (
        incident.status in ACTIVE_STATUSES
        and not incident.is_escalated
        and bool(relations(user, incident) & {REPORTER, ADMIN})
    )


def can_request_assignment(user: Any, incident: Any) -> bool:
    """Engineers can ask for open, unassigned incidents."""
    return user.role == ROLE_ENGINEER and incident.status == STATUS_OPEN and incident.assignee_id is None


def allowed_actions(user: Any, incident: Any) -> list[str]:
    """Everything (besides status changes) the user may do, so the UI can show only those buttons."""
    is_admin = user.role == ROLE_ADMIN
    active = incident.status in ACTIVE_STATUSES
    checks = {
        "edit": can_edit(user, incident),
        "change_priority": is_admin and incident.status != STATUS_CLOSED,
        "assign": is_admin and active,
        "escalate": can_escalate(user, incident),
        "deescalate": is_admin and incident.is_escalated and incident.status != STATUS_CLOSED,
        "add_note": is_participant(user, incident) and incident.status != STATUS_CLOSED,
        "request_assignment": can_request_assignment(user, incident),
        "close_as_duplicate": is_admin and incident.status != STATUS_CLOSED,
        "dismiss_possible_duplicate": (
            is_admin and incident.status != STATUS_CLOSED
            and getattr(incident, "possible_duplicate_of_id", None) is not None
        ),
        "delete": is_admin,
    }
    return [action for action, allowed in checks.items() if allowed]


# Status a ticket falls back to when its engineer is removed mid-work.
UNASSIGNED_FALLBACK = {STATUS_IN_PROGRESS: STATUS_OPEN, STATUS_BLOCKED: STATUS_OPEN}
