"""
Response models for the dashboard summary. Sections that don't apply to the
caller's role are null (e.g. engineer workload is admin-only).
"""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.constants import Availability, Category, Priority, Status
from app.core.schemas import QueryModel


class SummaryQuery(QueryModel):
    """Query string for GET /reports/summary."""

    days: int = Field(30, ge=1, le=365, description="Reporting window: incidents reported in the last N days")
    building_id: Optional[int] = Field(None, ge=1, description="Only incidents in this building")


class Count(BaseModel):
    """A labelled count (status, priority or category)."""

    key: str
    count: int


class Totals(BaseModel):
    """Headline numbers. `total` and `active` are all-time; the rest use the window."""

    total: int
    active: int = Field(description="Open + In Progress + Blocked")
    unassigned_open: int
    escalated_active: int
    reported_in_window: int
    resolved_in_window: int
    available_pool: Optional[int] = Field(None, description="Engineers: open, unassigned incidents they can request")


class Duration(BaseModel):
    """Hours from reporting to a milestone, over incidents reported in the window."""

    count: int = Field(description="Incidents that reached the milestone")
    avg_hours: Optional[float] = None
    median_hours: Optional[float] = None


class ResponseTimes(BaseModel):
    """How quickly incidents are acknowledged, assigned and resolved."""

    acknowledge: Duration
    assign: Duration
    resolve: Duration


class EngineerLoad(BaseModel):
    """One engineer's current workload and availability."""

    id: int
    full_name: str
    availability: Availability
    specialties: list[Category]
    active: int
    open: int
    in_progress: int
    blocked: int
    resolved_in_window: int
    pending_requests: int


class Hotspot(BaseModel):
    """A location and how many incidents were reported there in the window."""

    id: int
    label: str
    count: int


class Hotspots(BaseModel):
    """Locations with the most incidents in the window (top 5 each)."""

    buildings: list[Hotspot]
    floors: list[Hotspot]
    seats: list[Hotspot]


class AttentionItem(BaseModel):
    """An escalated or blocked incident and why."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: Status
    priority: Priority
    reason: Optional[str] = None
    since: Optional[datetime] = None
    assignee_name: Optional[str] = None


class Attention(BaseModel):
    """Active incidents that need attention."""

    escalated: list[AttentionItem]
    blocked: list[AttentionItem]


class Communication(BaseModel):
    """How well reporters are kept informed (incidents reported in the window)."""

    incidents: int
    with_staff_note: int = Field(description="Incidents where an engineer/admin wrote at least one note")
    with_staff_note_pct: Optional[float] = None
    avg_hours_to_first_staff_note: Optional[float] = None


class TrendPoint(BaseModel):
    """Incidents reported and resolved on one day (UTC)."""

    date: date
    reported: int
    resolved: int


class Summary(BaseModel):
    """Everything the dashboard shows for the current user."""

    scope: Literal["all", "assigned", "reported"] = Field(
        description="all (admin) · assigned: incidents assigned to me · reported: incidents I reported")
    window_days: int
    generated_at: datetime
    totals: Totals
    by_status: list[Count]
    by_priority: list[Count] = Field(description="Active incidents by priority")
    by_category: list[Count] = Field(description="Incidents reported in the window, most common first")
    response_times: ResponseTimes
    attention: Attention
    trend: list[TrendPoint]
    communication: Optional[Communication] = None
    workload: Optional[list[EngineerLoad]] = None
    hotspots: Optional[Hotspots] = None
