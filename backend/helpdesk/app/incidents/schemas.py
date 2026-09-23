"""
Request and response models for incidents, notes, history and assignment requests.
"""

from datetime import datetime
from typing import Annotated, Any, ClassVar, Literal, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

from app.core.constants import Category, EventType, Priority, RequestStatus, Role, Status
from app.core.schemas import PatchModel, QueryModel, StrictModel


def _text(max_length: int) -> Any:
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]


Title = _text(200)
Description = _text(5000)
Comment = _text(2000)
NoteBody = _text(5000)
Message = _text(1000)
Id = Annotated[int, Field(ge=1)]


def _split_csv(value: Any) -> Any:
    """Accept ?status=open,blocked as well as ?status=open&status=blocked."""
    if isinstance(value, str):
        value = [value]
    if isinstance(value, list):
        return [part.strip() for item in value for part in str(item).split(",") if part.strip()]
    return value


def CsvList(item_type: Any) -> Any:  # pylint: disable=invalid-name
    """A query parameter holding one or more values."""
    return Annotated[Optional[list[item_type]], BeforeValidator(_split_csv)]


# ---- Requests ---------------------------------------------------------------

class IncidentCreate(StrictModel):
    """POST /incidents. Priority is the reporter's suggestion; admins can change it later."""

    title: Title
    description: Description
    category: Category
    priority: Priority = "medium"
    building_id: Id
    floor_id: Optional[Id] = None
    seat_id: Optional[Id] = None


class IncidentUpdate(PatchModel):
    """PATCH /incidents/{id}. Reporters may edit while Open (not priority); admins until Closed."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset({"floor_id", "seat_id"})

    title: Title = None
    description: Description = None
    category: Category = None
    priority: Priority = None
    building_id: Id = None
    floor_id: Optional[Id] = None
    seat_id: Optional[Id] = None


class StatusChange(StrictModel):
    """POST /incidents/{id}/status."""

    status: Status
    comment: Optional[Comment] = Field(
        None, description="Reason (block, close, reopen) or resolution note (resolve)",
    )


class AssignRequest(StrictModel):
    """POST /incidents/{id}/assign. `null` unassigns."""

    engineer_id: Optional[Id]


class EscalateRequest(StrictModel):
    """POST /incidents/{id}/escalate."""

    reason: Comment


class NoteInput(StrictModel):
    """POST /incidents/{id}/notes and PATCH .../notes/{note_id}."""

    body: NoteBody


class AssignmentRequestCreate(StrictModel):
    """POST /incidents/{id}/assignment-requests."""

    message: Optional[Message] = None


class DecisionInput(StrictModel):
    """POST /assignment-requests/{id}/approve or /reject."""

    note: Optional[Message] = None


SortOption = Literal["created_at", "-created_at", "updated_at", "-updated_at", "priority", "-priority"]


class IncidentListQuery(QueryModel):
    """Query string for GET /incidents."""

    q: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]] = Field(
        None, description="Search title/description, or an id like 42 or #42")
    scope: Optional[Literal["reported", "assigned", "available"]] = Field(
        None, description="reported: by me · assigned: to me · available: open and unassigned")
    status: CsvList(Status) = None
    priority: CsvList(Priority) = None
    category: CsvList(Category) = None
    building_id: Optional[Id] = None
    floor_id: Optional[Id] = None
    assignee_id: Optional[Id] = None
    reporter_id: Optional[Id] = None
    escalated: Optional[bool] = None
    unassigned: Optional[bool] = None
    sort: SortOption = "-created_at"
    page: int = Field(1, ge=1, le=10_000)
    page_size: int = Field(25, ge=1, le=100)


class AssignmentRequestQuery(QueryModel):
    """Query string for GET /assignment-requests."""

    status: CsvList(RequestStatus) = None
    incident_id: Optional[Id] = None


# ---- Responses --------------------------------------------------------------

class _FromORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserSummary(_FromORM):
    """Who did something."""

    id: int
    full_name: str
    email: str
    role: Role


class BuildingRef(_FromORM):
    """Building name and id."""

    id: int
    name: str


class FloorRef(_FromORM):
    """Floor name, level and id."""

    id: int
    name: str
    level: int


class SeatRef(_FromORM):
    """Seat code and id."""

    id: int
    code: str


class IncidentSummary(_FromORM):
    """An incident as shown in lists."""

    id: int
    title: str
    category: Category
    priority: Priority
    status: Status
    is_escalated: bool
    building: BuildingRef
    floor: Optional[FloorRef] = None
    seat: Optional[SeatRef] = None
    reporter: UserSummary
    assignee: Optional[UserSummary] = None
    created_at: datetime
    updated_at: datetime


class RequestRef(_FromORM):
    """A pending/decided assignment request, as seen on the incident."""

    id: int
    status: RequestStatus
    created_at: datetime


class IncidentDetail(IncidentSummary):
    """Full incident, plus what the current user may do with it."""

    description: str
    escalation_reason: Optional[str] = None
    blocked_reason: Optional[str] = None
    resolution: Optional[str] = None
    close_reason: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    escalated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    allowed_transitions: list[Status] = Field(description="Statuses you may move this incident to")
    allowed_actions: list[str] = Field(description="Other actions available to you")
    my_assignment_request: Optional[RequestRef] = Field(
        None, description="Engineers: your latest request for this incident")


class IncidentResponse(BaseModel):
    """Single incident envelope."""

    incident: IncidentDetail


class IncidentListResponse(BaseModel):
    """A page of incidents."""

    items: list[IncidentSummary]
    total: int
    page: int
    page_size: int


class EventPublic(_FromORM):
    """One history entry."""

    id: int
    type: EventType
    from_value: Optional[str] = None
    to_value: Optional[str] = None
    comment: Optional[str] = None
    actor: UserSummary
    created_at: datetime


class EventListResponse(BaseModel):
    """An incident's history, oldest first."""

    items: list[EventPublic]


class NotePublic(_FromORM):
    """A note on an incident."""

    id: int
    incident_id: int
    body: str
    author: UserSummary
    created_at: datetime
    updated_at: datetime


class NoteResponse(BaseModel):
    """Single note envelope."""

    note: NotePublic


class NoteListResponse(BaseModel):
    """Notes on an incident, oldest first."""

    items: list[NotePublic]


class IncidentRef(_FromORM):
    """The incident an assignment request is for."""

    id: int
    title: str
    status: Status
    priority: Priority
    category: Category


class AssignmentRequestPublic(_FromORM):
    """An engineer's request to take an incident."""

    id: int
    incident: IncidentRef
    engineer: UserSummary
    status: RequestStatus
    message: Optional[str] = None
    decided_by: Optional[UserSummary] = None
    decision_note: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime


class AssignmentRequestResponse(BaseModel):
    """Single assignment request envelope."""

    request: AssignmentRequestPublic


class AssignmentRequestListResponse(BaseModel):
    """Assignment requests, newest first."""

    items: list[AssignmentRequestPublic]
