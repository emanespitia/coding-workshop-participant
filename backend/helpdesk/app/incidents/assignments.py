"""
Assignment requests: engineers ask to take an open, unassigned incident and an
admin approves or rejects. Approving assigns the engineer (via service.assign),
which also rejects everyone else's pending requests for that incident.
"""

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import ROLE_ADMIN, ROLE_ENGINEER, STATUS_OPEN
from app.core.db import integrity_guard
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.incidents import service, workflow
from app.incidents.models import AssignmentRequest
from app.incidents.schemas import AssignmentRequestQuery
from app.users.models import User


def _load(session: Session, request_id: int, *, for_update: bool = False) -> AssignmentRequest:
    query = select(AssignmentRequest).where(AssignmentRequest.id == request_id)
    if for_update:
        query = query.with_for_update(of=AssignmentRequest).execution_options(populate_existing=True)
    request = session.scalars(query).unique().one_or_none()
    if request is None:
        raise NotFoundError("Assignment request not found")
    return request


def _ensure_pending(request: AssignmentRequest) -> None:
    if request.status != "pending":
        raise ConflictError(f"This request is already {request.status}", code="REQUEST_NOT_PENDING")


def request_assignment(session: Session, engineer: User, incident_id: int,
                       message: Optional[str]) -> AssignmentRequest:
    """An engineer asks to be assigned to an open, unassigned incident."""
    incident = service.get_visible(session, engineer, incident_id, for_update=True)
    if not workflow.can_request_assignment(engineer, incident):
        raise ConflictError("This incident is no longer open and unassigned", code="NOT_AVAILABLE")
    request = AssignmentRequest(incident_id=incident.id, engineer_id=engineer.id, message=message)
    session.add(request)
    with integrity_guard(duplicate=ConflictError(
            "You already have a pending request for this incident", code="ALREADY_REQUESTED")):
        session.flush()
    service.record(session, incident, engineer, "assignment_requested", comment=message)
    session.flush()
    session.refresh(request)
    return request


def list_requests(session: Session, user: User, query: AssignmentRequestQuery) -> list[AssignmentRequest]:
    """Admins see every request; engineers see their own. Newest first."""
    conditions = []
    if user.role != ROLE_ADMIN:
        conditions.append(AssignmentRequest.engineer_id == user.id)
    if query.status:
        conditions.append(AssignmentRequest.status.in_(query.status))
    if query.incident_id is not None:
        conditions.append(AssignmentRequest.incident_id == query.incident_id)
    return list(session.scalars(
        select(AssignmentRequest).where(*conditions)
        .order_by(AssignmentRequest.created_at.desc(), AssignmentRequest.id.desc())
        .limit(200)
    ).unique().all())


def approve(session: Session, admin: User, request_id: int, note: Optional[str]) -> AssignmentRequest:
    """Assign the requesting engineer to the incident."""
    request = _load(session, request_id)
    incident = service.load(session, request.incident_id, for_update=True)  # lock order: incident first
    request = _load(session, request_id, for_update=True)
    _ensure_pending(request)
    if incident.assignee_id is not None or incident.status != STATUS_OPEN:
        raise ConflictError("The incident is no longer open and unassigned", code="NOT_AVAILABLE")
    engineer = request.engineer
    if engineer.role != ROLE_ENGINEER or not engineer.is_active:
        raise ConflictError("This engineer can no longer be assigned", code="ENGINEER_UNAVAILABLE")
    service.assign(session, admin, incident.id, engineer.id, note=note)
    session.refresh(request)
    return request


def reject(session: Session, admin: User, request_id: int, note: Optional[str]) -> AssignmentRequest:
    """Turn down a request, optionally explaining why."""
    request = _load(session, request_id, for_update=True)
    _ensure_pending(request)
    request.status = "rejected"
    request.decided_by_id = admin.id
    request.decided_at = func.now()
    request.decision_note = note
    service.record(session, request.incident, admin, "assignment_rejected",
                   to_value=request.engineer.full_name, comment=note)
    session.flush()
    session.refresh(request)
    return request


def withdraw(session: Session, engineer: User, request_id: int) -> AssignmentRequest:
    """An engineer cancels their own pending request."""
    request = _load(session, request_id, for_update=True)
    if request.engineer_id != engineer.id:
        raise ForbiddenError("You can only withdraw your own requests")
    _ensure_pending(request)
    request.status = "withdrawn"
    request.decided_at = func.now()
    session.flush()
    session.refresh(request)
    return request
