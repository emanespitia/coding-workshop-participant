"""
Incident endpoints: list/search, report, view, edit, status changes, assignment,
escalation, history and notes.

What each user sees and may do is decided in app.incidents.workflow; incident
details include `allowed_transitions` and `allowed_actions` so the UI can show
only the buttons that will work.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.incidents import notes, service
from app.incidents.schemas import (
    AssignRequest,
    EscalateRequest,
    EventListResponse,
    IncidentCreate,
    IncidentListQuery,
    IncidentListResponse,
    IncidentResponse,
    IncidentUpdate,
    NoteInput,
    NoteListResponse,
    NoteResponse,
    StatusChange,
)

router = APIRouter(prefix="/incidents", tags=["incidents"])
NO_CONTENT = {"status_code": status.HTTP_204_NO_CONTENT, "response_class": Response}


@router.get("", response_model=IncidentListResponse)
def list_incidents(query: Annotated[IncidentListQuery, Query()], db: DbSession, user: CurrentUser) -> dict:
    """
    Search and filter incidents you can see.

    Employees see what they reported; engineers see their assigned work plus
    open, unassigned incidents; admins see everything. List filters accept
    several values (`?status=open,blocked`).
    """
    items, total = service.list_incidents(db, user, query)
    return {"items": items, "total": total, "page": query.page, "page_size": query.page_size}


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_incident(body: IncidentCreate, db: DbSession, user: CurrentUser) -> dict:
    """Report an incident. It starts **Open** and unassigned; priority is your suggestion."""
    incident = service.create_incident(db, user, body.model_dump())
    return service.detail(db, user, incident)


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: int, db: DbSession, user: CurrentUser) -> dict:
    """An incident with the status changes and actions available to you."""
    return service.detail(db, user, service.get_visible(db, user, incident_id))


@router.patch("/{incident_id}", response_model=IncidentResponse)
def update_incident(incident_id: int, body: IncidentUpdate, db: DbSession, user: CurrentUser) -> dict:
    """
    Edit details.

    * **Reporter:** title, description, category, location while the incident is Open.
    * **Admin:** anything, including priority, until it is Closed.
    """
    incident = service.update_incident(db, user, incident_id, body.model_dump(exclude_unset=True))
    return service.detail(db, user, incident)


@router.delete("/{incident_id}", **NO_CONTENT)
def delete_incident(incident_id: int, db: DbSession, admin: AdminUser) -> None:
    """Permanently delete an incident with its history and notes. **Admin only.**"""
    service.delete_incident(db, admin, incident_id)


@router.post("/{incident_id}/status", response_model=IncidentResponse)
def change_status(incident_id: int, body: StatusChange, db: DbSession, user: CurrentUser) -> dict:
    """
    Move the incident through the workflow.

    | From → To | Who | Needs `comment` |
    |---|---|---|
    | open → in_progress | assigned engineer, admin (needs an assignee) | |
    | open → closed | reporter, admin | reason |
    | in_progress → blocked | assigned engineer, admin | reason |
    | blocked → in_progress | assigned engineer, admin | |
    | in_progress → resolved | assigned engineer, admin | resolution |
    | resolved → closed | admin | |
    | resolved → in_progress | admin (reopen) | reason |
    | in_progress / blocked → closed | admin | reason |
    """
    incident = service.change_status(db, user, incident_id, body.status, body.comment)
    return service.detail(db, user, incident)


@router.post("/{incident_id}/assign", response_model=IncidentResponse)
def assign(incident_id: int, body: AssignRequest, db: DbSession, admin: AdminUser) -> dict:
    """
    Assign an engineer, reassign, or unassign with `null`. **Admin only.**

    Pending assignment requests are settled automatically. Unassigning an
    In Progress / Blocked incident sends it back to Open.
    """
    return service.detail(db, admin, service.assign(db, admin, incident_id, body.engineer_id))


@router.post("/{incident_id}/escalate", response_model=IncidentResponse)
def escalate(incident_id: int, body: EscalateRequest, db: DbSession, user: CurrentUser) -> dict:
    """Flag an active incident as needing attention (reporter or admin)."""
    return service.detail(db, user, service.escalate(db, user, incident_id, body.reason))


@router.delete("/{incident_id}/escalation", response_model=IncidentResponse)
def deescalate(incident_id: int, db: DbSession, admin: AdminUser) -> dict:
    """Clear the escalation flag. **Admin only.**"""
    return service.detail(db, admin, service.deescalate(db, admin, incident_id))


@router.get("/{incident_id}/events", response_model=EventListResponse)
def list_events(incident_id: int, db: DbSession, user: CurrentUser) -> dict:
    """The incident's history (who changed what, when and why), oldest first."""
    return {"items": service.list_events(db, user, incident_id)}


# ---- Notes ----------------------------------------------------------------------

@router.get("/{incident_id}/notes", response_model=NoteListResponse)
def list_notes(incident_id: int, db: DbSession, user: CurrentUser) -> dict:
    """Notes on the incident, oldest first."""
    return {"items": notes.list_notes(db, user, incident_id)}


@router.post("/{incident_id}/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
def add_note(incident_id: int, body: NoteInput, db: DbSession, user: CurrentUser) -> dict:
    """Add a note (reporter, assigned engineer or admin; not on Closed incidents)."""
    return {"note": notes.add_note(db, user, incident_id, body.body)}


@router.patch("/{incident_id}/notes/{note_id}", response_model=NoteResponse)
def edit_note(incident_id: int, note_id: int, body: NoteInput, db: DbSession, user: CurrentUser) -> dict:
    """Edit your own note."""
    return {"note": notes.edit_note(db, user, incident_id, note_id, body.body)}


@router.delete("/{incident_id}/notes/{note_id}", **NO_CONTENT)
def delete_note(incident_id: int, note_id: int, db: DbSession, user: CurrentUser) -> None:
    """Delete your own note (admins can delete any)."""
    notes.delete_note(db, user, incident_id, note_id)
