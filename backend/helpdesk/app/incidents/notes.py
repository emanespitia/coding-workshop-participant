"""
Incident notes: the conversation between the reporter, the assigned engineer and admins.

Anyone who can see an incident can read its notes. Participants (reporter,
assignee, admins) can add notes until the incident is Closed. Authors can edit
their own notes; authors and admins can delete them.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import ROLE_ADMIN, STATUS_CLOSED
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.incidents import service, workflow
from app.incidents.models import Incident, IncidentNote
from app.users.models import User


def _ensure_open(incident: Incident) -> None:
    if incident.status == STATUS_CLOSED:
        raise ConflictError("Closed incidents can't be changed", code="INVALID_STATE")


def _get_note(session: Session, user: User, incident_id: int, note_id: int) -> tuple[Incident, IncidentNote]:
    incident = service.get_visible(session, user, incident_id)
    note = session.get(IncidentNote, note_id)
    if note is None or note.incident_id != incident.id:
        raise NotFoundError("Note not found")
    return incident, note


def list_notes(session: Session, user: User, incident_id: int) -> list[IncidentNote]:
    """Notes on an incident, oldest first."""
    service.get_visible(session, user, incident_id)
    return list(session.scalars(
        select(IncidentNote).where(IncidentNote.incident_id == incident_id)
        .order_by(IncidentNote.created_at, IncidentNote.id)
    ).unique().all())


def add_note(session: Session, user: User, incident_id: int, body: str) -> IncidentNote:
    """Post a note. A note from an engineer or admin counts as acknowledging the incident."""
    incident = service.get_visible(session, user, incident_id, for_update=True)
    if not workflow.is_participant(user, incident):
        raise ForbiddenError("Only the reporter, the assigned engineer or an admin can add notes")
    _ensure_open(incident)
    note = IncidentNote(incident_id=incident.id, author_id=user.id, body=body)
    session.add(note)
    incident.updated_at = func.now()
    if incident.reporter_id != user.id:
        service.acknowledge(incident, user)
    session.flush()
    session.refresh(note)
    return note


def edit_note(session: Session, user: User, incident_id: int, note_id: int, body: str) -> IncidentNote:
    """Change your own note while the incident isn't Closed."""
    incident, note = _get_note(session, user, incident_id, note_id)
    if note.author_id != user.id:
        raise ForbiddenError("You can only edit your own notes")
    _ensure_open(incident)
    note.body = body
    session.flush()
    session.refresh(note)
    return note


def delete_note(session: Session, user: User, incident_id: int, note_id: int) -> None:
    """Delete your own note (admins can delete any note)."""
    _, note = _get_note(session, user, incident_id, note_id)
    if note.author_id != user.id and user.role != ROLE_ADMIN:
        raise ForbiddenError("You can only delete your own notes")
    session.delete(note)
    session.flush()
