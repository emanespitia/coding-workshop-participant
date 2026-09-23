"""
Assignment request endpoints: engineers ask to take an incident, admins decide.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.constants import ROLE_ADMIN, ROLE_ENGINEER
from app.core.deps import AdminUser, DbSession, require_roles
from app.incidents import assignments
from app.incidents.schemas import (
    AssignmentRequestCreate,
    AssignmentRequestListResponse,
    AssignmentRequestQuery,
    AssignmentRequestResponse,
    DecisionInput,
)
from app.users.models import User

router = APIRouter(tags=["assignment requests"])

EngineerUser = Annotated[User, Depends(require_roles(ROLE_ENGINEER))]
StaffUser = Annotated[User, Depends(require_roles(ROLE_ENGINEER, ROLE_ADMIN))]


@router.post("/incidents/{incident_id}/assignment-requests", response_model=AssignmentRequestResponse,
             status_code=status.HTTP_201_CREATED)
def request_assignment(incident_id: int, body: AssignmentRequestCreate, db: DbSession,
                       engineer: EngineerUser) -> dict:
    """Ask to be assigned to an open, unassigned incident. **Engineers only.**"""
    return {"request": assignments.request_assignment(db, engineer, incident_id, body.message)}


@router.get("/assignment-requests", response_model=AssignmentRequestListResponse)
def list_requests(query: Annotated[AssignmentRequestQuery, Query()], db: DbSession, user: StaffUser) -> dict:
    """Admins see all requests; engineers see their own. Filter with `?status=pending`."""
    return {"items": assignments.list_requests(db, user, query)}


@router.post("/assignment-requests/{request_id}/approve", response_model=AssignmentRequestResponse)
def approve(request_id: int, body: DecisionInput, db: DbSession, admin: AdminUser) -> dict:
    """Approve: the engineer is assigned and other pending requests are rejected. **Admin only.**"""
    return {"request": assignments.approve(db, admin, request_id, body.note)}


@router.post("/assignment-requests/{request_id}/reject", response_model=AssignmentRequestResponse)
def reject(request_id: int, body: DecisionInput, db: DbSession, admin: AdminUser) -> dict:
    """Reject a request, optionally with a note. **Admin only.**"""
    return {"request": assignments.reject(db, admin, request_id, body.note)}


@router.post("/assignment-requests/{request_id}/withdraw", response_model=AssignmentRequestResponse)
def withdraw(request_id: int, db: DbSession, engineer: EngineerUser) -> dict:
    """Withdraw your own pending request. **Engineers only.**"""
    return {"request": assignments.withdraw(db, engineer, request_id)}
