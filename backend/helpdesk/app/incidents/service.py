"""
Incident lifecycle: create, edit, status changes, assignment, escalation, history.

Every change locks the incident row first (SELECT ... FOR UPDATE), so two people
acting on the same incident at once are applied one after the other. Lock order
is always incident, then its assignment requests.
"""

from typing import Any, Optional

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.constants import (
    ACTIVE_STATUSES,
    ROLE_ADMIN,
    ROLE_ENGINEER,
    STATUS_BLOCKED,
    STATUS_CLOSED,
    STATUS_OPEN,
    STATUS_RESOLVED,
)
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.facilities.models import Building, Floor, Seat
from app.incidents import workflow
from app.incidents.models import AssignmentRequest, Incident, IncidentEvent
from app.incidents.schemas import IncidentListQuery
from app.users.models import User

_PRIORITY_RANK = case(
    {"critical": 4, "high": 3, "medium": 2, "low": 1}, value=Incident.priority, else_=0
)
_SORTS = {
    "created_at": Incident.created_at.asc(),
    "-created_at": Incident.created_at.desc(),
    "updated_at": Incident.updated_at.asc(),
    "-updated_at": Incident.updated_at.desc(),
    "priority": _PRIORITY_RANK.asc(),
    "-priority": _PRIORITY_RANK.desc(),
}
_LOCATION_FIELDS = ("building_id", "floor_id", "seat_id")


# ---- Loading & helpers ----------------------------------------------------------

def load(session: Session, incident_id: int, *, for_update: bool = False) -> Optional[Incident]:
    """Fetch an incident (with location and people), optionally locking its row."""
    query = select(Incident).where(Incident.id == incident_id)
    if for_update:
        query = query.with_for_update(of=Incident).execution_options(populate_existing=True)
    return session.scalars(query).unique().one_or_none()


def get_visible(session: Session, user: User, incident_id: int, *, for_update: bool = False) -> Incident:
    """
    The incident if this user may see it.

    Incidents the user may not see return 404 (not 403) so their existence isn't revealed.
    """
    incident = load(session, incident_id, for_update=for_update)
    if incident is None or not workflow.can_view(user, incident):
        raise NotFoundError("Incident not found")
    return incident


def record(session: Session, incident: Incident, actor: User, event_type: str, *,
           from_value: Optional[str] = None, to_value: Optional[str] = None,
           comment: Optional[str] = None) -> None:
    """Append an entry to the incident's history."""
    session.add(IncidentEvent(
        incident_id=incident.id, actor_id=actor.id, type=event_type,
        from_value=from_value, to_value=to_value, comment=comment,
    ))


def acknowledge(incident: Incident, actor: User) -> None:
    """Stamp the first time an engineer or admin acts on the incident."""
    if actor.role in (ROLE_ENGINEER, ROLE_ADMIN) and incident.acknowledged_at is None:
        incident.acknowledged_at = func.now()


def _save(session: Session, incident: Incident) -> Incident:
    session.flush()
    session.refresh(incident)
    return incident


def _validate_location(session: Session, building_id: int, floor_id: Optional[int],
                       seat_id: Optional[int]) -> None:
    """Check the building exists, the floor is in it and the seat is on that floor."""
    errors: dict[str, str] = {}
    if session.get(Building, building_id) is None:
        errors["building_id"] = "Building not found"
    if floor_id is not None:
        floor = session.get(Floor, floor_id)
        if floor is None:
            errors["floor_id"] = "Floor not found"
        elif floor.building_id != building_id:
            errors["floor_id"] = "This floor is not in the selected building"
    if seat_id is not None:
        seat = session.get(Seat, seat_id)
        if floor_id is None:
            errors["seat_id"] = "Choose a floor before choosing a seat"
        elif seat is None:
            errors["seat_id"] = "Seat not found"
        elif seat.floor_id != floor_id:
            errors["seat_id"] = "This seat is not on the selected floor"
    if errors:
        raise ValidationError(errors)


def settle_requests(session: Session, incident: Incident, admin: User, *,
                    approved_engineer_id: Optional[int], note: Optional[str], reason: str) -> None:
    """
    Close out pending assignment requests on an incident: the assigned engineer's
    request (if any) is approved, all others are rejected with `reason`.
    """
    pending = session.scalars(
        select(AssignmentRequest)
        .where(AssignmentRequest.incident_id == incident.id, AssignmentRequest.status == "pending")
        .with_for_update(of=AssignmentRequest)
    ).unique().all()
    for request in pending:
        approved = request.engineer_id == approved_engineer_id
        request.status = "approved" if approved else "rejected"
        request.decided_by_id = admin.id
        request.decided_at = func.now()
        request.decision_note = note if approved else reason


# ---- Queries ----------------------------------------------------------------------

def list_incidents(session: Session, user: User, query: IncidentListQuery) -> tuple[list[Incident], int]:
    """Incidents visible to the user, filtered, sorted and paginated."""
    conditions: list[Any] = [workflow.visibility_condition(user, Incident)]
    if query.scope == "reported":
        conditions.append(Incident.reporter_id == user.id)
    elif query.scope == "assigned":
        conditions.append(Incident.assignee_id == user.id)
    elif query.scope == "available":
        conditions += [Incident.assignee_id.is_(None), Incident.status == STATUS_OPEN]
    if query.q:
        needle = query.q.lower()
        text_match = (func.strpos(func.lower(Incident.title), needle) > 0) | (
            func.strpos(func.lower(Incident.description), needle) > 0)
        as_id = query.q.lstrip("#")
        conditions.append(text_match | (Incident.id == int(as_id)) if as_id.isdigit() else text_match)
    for column, values in ((Incident.status, query.status), (Incident.priority, query.priority),
                           (Incident.category, query.category)):
        if values:
            conditions.append(column.in_(values))
    for column, value in ((Incident.building_id, query.building_id), (Incident.floor_id, query.floor_id),
                          (Incident.assignee_id, query.assignee_id), (Incident.reporter_id, query.reporter_id)):
        if value is not None:
            conditions.append(column == value)
    if query.escalated is not None:
        conditions.append(Incident.is_escalated.is_(query.escalated))
    if query.unassigned is not None:
        conditions.append(Incident.assignee_id.is_(None) if query.unassigned else Incident.assignee_id.is_not(None))

    total = session.scalar(select(func.count()).select_from(Incident).where(*conditions))
    items = session.scalars(
        select(Incident).where(*conditions)
        .order_by(_SORTS[query.sort], Incident.id.desc())
        .limit(query.page_size).offset((query.page - 1) * query.page_size)
    ).unique().all()
    return list(items), total


def detail(session: Session, user: User, incident: Incident) -> dict:
    """The incident plus what this user may do with it (for IncidentDetail)."""
    my_request = None
    if user.role == ROLE_ENGINEER:
        my_request = session.scalars(
            select(AssignmentRequest)
            .where(AssignmentRequest.incident_id == incident.id, AssignmentRequest.engineer_id == user.id)
            .order_by(AssignmentRequest.created_at.desc(), AssignmentRequest.id.desc())
            .limit(1)
        ).unique().one_or_none()
    actions = workflow.allowed_actions(user, incident)
    if my_request is not None and my_request.status == "pending" and "request_assignment" in actions:
        actions.remove("request_assignment")
    return {
        "incident": {
            **{name: getattr(incident, name) for name in _DETAIL_ATTRIBUTES},
            "allowed_transitions": workflow.allowed_transitions(user, incident),
            "allowed_actions": actions,
            "my_assignment_request": my_request,
        }
    }


_DETAIL_ATTRIBUTES = (
    "id", "title", "description", "category", "priority", "status", "is_escalated",
    "building", "floor", "seat", "reporter", "assignee",
    "escalation_reason", "blocked_reason", "resolution", "close_reason",
    "created_at", "updated_at", "acknowledged_at", "assigned_at", "escalated_at", "resolved_at", "closed_at",
)


def list_events(session: Session, user: User, incident_id: int) -> list[IncidentEvent]:
    """The incident's history, oldest first."""
    get_visible(session, user, incident_id)
    return list(session.scalars(
        select(IncidentEvent).where(IncidentEvent.incident_id == incident_id)
        .order_by(IncidentEvent.created_at, IncidentEvent.id)
    ).unique().all())


# ---- Changes ----------------------------------------------------------------------

def create_incident(session: Session, reporter: User, data: dict[str, Any]) -> Incident:
    """Report a new incident. It starts Open and unassigned."""
    _validate_location(session, data["building_id"], data.get("floor_id"), data.get("seat_id"))
    incident = Incident(**data, reporter_id=reporter.id, status=STATUS_OPEN)
    session.add(incident)
    session.flush()
    record(session, incident, reporter, "created", to_value=STATUS_OPEN)
    return _save(session, incident)


def update_incident(session: Session, user: User, incident_id: int, changes: dict[str, Any]) -> Incident:
    """Edit details. Reporters: while Open, not priority. Admins: until Closed."""
    incident = get_visible(session, user, incident_id, for_update=True)
    if not workflow.can_edit(user, incident):
        raise ForbiddenError("You can't edit this incident now" if incident.reporter_id == user.id
                             else "You can't edit this incident")
    if "priority" in changes and user.role != ROLE_ADMIN:
        raise ForbiddenError("Only admins can change priority; escalate the incident instead",
                             code="FORBIDDEN_FIELD")

    if any(field in changes for field in _LOCATION_FIELDS):
        building_id = changes.get("building_id", incident.building_id)
        if "floor_id" in changes:
            floor_id = changes["floor_id"]
        else:  # moving to another building clears the old floor
            floor_id = incident.floor_id if building_id == incident.building_id else None
        if "seat_id" in changes:
            seat_id = changes["seat_id"]
        else:
            seat_id = incident.seat_id if floor_id == incident.floor_id else None
        _validate_location(session, building_id, floor_id, seat_id)
        changes.update(building_id=building_id, floor_id=floor_id, seat_id=seat_id)

    changes = {k: v for k, v in changes.items() if getattr(incident, k) != v}
    if "priority" in changes:
        record(session, incident, user, "priority_changed",
               from_value=incident.priority, to_value=changes["priority"])
    edited = sorted(set(changes) - {"priority"})
    if edited:
        record(session, incident, user, "updated", comment="Changed " + ", ".join(edited))
    for name, value in changes.items():
        setattr(incident, name, value)
    return _save(session, incident)


def change_status(session: Session, user: User, incident_id: int, new_status: str,
                  comment: Optional[str]) -> Incident:
    """Move an incident through the workflow (see workflow.TRANSITIONS)."""
    incident = get_visible(session, user, incident_id, for_update=True)
    current = incident.status
    rule = workflow.TRANSITIONS.get((current, new_status))
    if rule is None:
        raise ConflictError(f"An incident can't go from {current} to {new_status}", code="INVALID_TRANSITION")
    if not workflow.relations(user, incident) & set(rule.allowed):
        raise ForbiddenError("You can't make this status change")
    if rule.requires_assignee and incident.assignee_id is None:
        raise ConflictError("Assign an engineer before starting work", code="NO_ASSIGNEE")
    if rule.requires_comment and not comment:
        raise ValidationError({"comment": rule.requires_comment})

    if current == STATUS_BLOCKED:
        incident.blocked_reason = None
    if new_status == STATUS_BLOCKED:
        incident.blocked_reason = comment
    elif new_status == STATUS_RESOLVED:
        incident.resolution = comment
        incident.resolved_at = func.now()
    elif new_status == STATUS_CLOSED:
        incident.closed_at = func.now()
        if comment:
            incident.close_reason = comment
        settle_requests(session, incident, user, approved_engineer_id=None, note=None,
                        reason="The incident was closed")
    elif current == STATUS_RESOLVED:  # reopened
        incident.resolution = None
        incident.resolved_at = None

    incident.status = new_status
    acknowledge(incident, user)
    record(session, incident, user, "status_changed", from_value=current, to_value=new_status, comment=comment)
    return _save(session, incident)


def assign(session: Session, admin: User, incident_id: int, engineer_id: Optional[int], *,
           note: Optional[str] = None) -> Incident:
    """
    Assign (or with None, unassign) an engineer. Admin only.

    Pending assignment requests are settled: the chosen engineer's is approved,
    others are rejected. Unassigning mid-work sends the incident back to Open.
    """
    incident = get_visible(session, admin, incident_id, for_update=True)
    if incident.status not in ACTIVE_STATUSES:
        raise ConflictError("Only open, in-progress or blocked incidents can be assigned", code="INVALID_STATE")
    previous = incident.assignee

    if engineer_id is None:
        if previous is None:
            return incident
        incident.assignee_id = None
        record(session, incident, admin, "unassigned", from_value=previous.full_name)
        fallback = workflow.UNASSIGNED_FALLBACK.get(incident.status)
        if fallback:
            record(session, incident, admin, "status_changed", from_value=incident.status, to_value=fallback,
                   comment="Engineer unassigned")
            incident.status = fallback
            incident.blocked_reason = None
        return _save(session, incident)

    engineer = session.get(User, engineer_id)
    if engineer is None or engineer.role != ROLE_ENGINEER or not engineer.is_active:
        raise ValidationError({"engineer_id": "Choose an active engineer"})
    if previous is not None and previous.id == engineer.id:
        return incident

    incident.assignee_id = engineer.id
    incident.assigned_at = func.now()
    acknowledge(incident, admin)
    record(session, incident, admin, "assigned",
           from_value=previous.full_name if previous else None, to_value=engineer.full_name, comment=note)
    settle_requests(session, incident, admin, approved_engineer_id=engineer.id, note=note,
                    reason=f"The incident was assigned to {engineer.full_name}")
    return _save(session, incident)


def escalate(session: Session, user: User, incident_id: int, reason: str) -> Incident:
    """Flag an active incident for attention. Reporter or admin, once."""
    incident = get_visible(session, user, incident_id, for_update=True)
    if not workflow.relations(user, incident) & {workflow.REPORTER, workflow.ADMIN}:
        raise ForbiddenError("Only the reporter or an admin can escalate this incident")
    if incident.status not in ACTIVE_STATUSES:
        raise ConflictError("Only active incidents can be escalated", code="INVALID_STATE")
    if incident.is_escalated:
        raise ConflictError("This incident is already escalated", code="ALREADY_ESCALATED")
    incident.is_escalated = True
    incident.escalation_reason = reason
    incident.escalated_at = func.now()
    record(session, incident, user, "escalated", comment=reason)
    return _save(session, incident)


def deescalate(session: Session, admin: User, incident_id: int) -> Incident:
    """Clear the escalation flag. Admin only."""
    incident = get_visible(session, admin, incident_id, for_update=True)
    if not incident.is_escalated:
        raise ConflictError("This incident is not escalated", code="NOT_ESCALATED")
    record(session, incident, admin, "deescalated", comment=incident.escalation_reason)
    incident.is_escalated = False
    incident.escalation_reason = None
    return _save(session, incident)


def delete_incident(session: Session, admin: User, incident_id: int) -> None:
    """Permanently delete an incident with its history, notes and requests. Admin only."""
    session.delete(get_visible(session, admin, incident_id, for_update=True))
    session.flush()


# ---- Used by user management ----------------------------------------------------

def active_incident_ids(session: Session, engineer_id: int) -> list[int]:
    """Ids of Open / In Progress / Blocked incidents assigned to the engineer."""
    return list(session.scalars(
        select(Incident.id).where(Incident.assignee_id == engineer_id, Incident.status.in_(ACTIVE_STATUSES))
        .order_by(Incident.id)
    ).all())


def withdraw_pending_requests(session: Session, engineer_id: int) -> None:
    """Withdraw an engineer's pending requests (e.g. when they stop being an engineer)."""
    for request in session.scalars(
        select(AssignmentRequest)
        .where(AssignmentRequest.engineer_id == engineer_id, AssignmentRequest.status == "pending")
    ).unique().all():
        request.status = "withdrawn"
        request.decided_at = func.now()
