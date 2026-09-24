"""
ORM models for incidents, their history (events), notes and assignment requests.

Foreign keys to users and facilities use RESTRICT: a user or location that an
incident refers to cannot be deleted (deactivate the user instead). Deleting an
incident removes its events, notes and assignment requests.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import CATEGORIES, EVENT_TYPES, PRIORITIES, REQUEST_STATUSES, STATUSES
from app.core.orm import Base, in_list
from app.facilities.models import Building, Floor, Seat
from app.users.models import User

_TIMESTAMP = DateTime(timezone=True)


class Incident(Base):
    """A reported facility or workplace-technology issue."""

    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint(in_list("status", STATUSES), name="incidents_status_check"),
        CheckConstraint(in_list("priority", PRIORITIES), name="incidents_priority_check"),
        CheckConstraint(in_list("category", CATEGORIES), name="incidents_category_check"),
        CheckConstraint("seat_id IS NULL OR floor_id IS NOT NULL", name="incidents_seat_needs_floor"),
        Index("incidents_status_idx", "status"),
        Index("incidents_assignee_idx", "assignee_id"),
        Index("incidents_reporter_idx", "reporter_id"),
        Index("incidents_building_idx", "building_id"),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(Text, server_default=text("'medium'"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'open'"))

    building_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("buildings.id", ondelete="RESTRICT"))
    floor_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("floors.id", ondelete="RESTRICT"))
    seat_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("seats.id", ondelete="RESTRICT"))

    reporter_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    assignee_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))

    is_escalated: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    escalation_reason: Mapped[Optional[str]] = mapped_column(Text)
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text)
    resolution: Mapped[Optional[str]] = mapped_column(Text)
    close_reason: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(_TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(_TIMESTAMP, server_default=func.now(), onupdate=func.now())
    # Lifecycle timestamps used for response-time reporting.
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(_TIMESTAMP)  # first action by staff
    assigned_at: Mapped[Optional[datetime]] = mapped_column(_TIMESTAMP)      # latest assignment
    escalated_at: Mapped[Optional[datetime]] = mapped_column(_TIMESTAMP)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(_TIMESTAMP)
    closed_at: Mapped[Optional[datetime]] = mapped_column(_TIMESTAMP)

    # Duplicates: flagged automatically when a similar active incident existed at report time
    # (admins review it), and set when an admin closes this incident as a duplicate.
    possible_duplicate_of_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("incidents.id", ondelete="SET NULL"))
    duplicate_of_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("incidents.id", ondelete="SET NULL"))

    building: Mapped[Building] = relationship(lazy="joined")
    floor: Mapped[Optional[Floor]] = relationship(lazy="joined")
    seat: Mapped[Optional[Seat]] = relationship(lazy="joined")
    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id], lazy="joined")
    assignee: Mapped[Optional[User]] = relationship(foreign_keys=[assignee_id], lazy="joined")
    # Loaded only when needed (the incident page), not for every row in a list.
    possible_duplicate_of: Mapped[Optional["Incident"]] = relationship(
        foreign_keys=[possible_duplicate_of_id], remote_side=[id], lazy="select")
    duplicate_of: Mapped[Optional["Incident"]] = relationship(
        foreign_keys=[duplicate_of_id], remote_side=[id], lazy="select")


class IncidentEvent(Base):
    """One entry in an incident's history (who changed what, when, and why)."""

    __tablename__ = "incident_events"
    __table_args__ = (
        CheckConstraint(in_list("type", EVENT_TYPES), name="incident_events_type_check"),
        Index("incident_events_incident_idx", "incident_id", "created_at"),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    incident_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("incidents.id", ondelete="CASCADE"))
    actor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    type: Mapped[str] = mapped_column(Text)
    from_value: Mapped[Optional[str]] = mapped_column(Text)
    to_value: Mapped[Optional[str]] = mapped_column(Text)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(_TIMESTAMP, server_default=func.now())

    actor: Mapped[User] = relationship(lazy="joined")


class IncidentNote(Base):
    """A message on an incident, used to keep the reporter and engineers in touch."""

    __tablename__ = "incident_notes"
    __table_args__ = (Index("incident_notes_incident_idx", "incident_id", "created_at"),)
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    incident_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("incidents.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(_TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(_TIMESTAMP, server_default=func.now(), onupdate=func.now())

    author: Mapped[User] = relationship(lazy="joined")


class AssignmentRequest(Base):
    """An engineer asking to be assigned to an unassigned incident; an admin decides."""

    __tablename__ = "assignment_requests"
    __table_args__ = (
        CheckConstraint(in_list("status", REQUEST_STATUSES), name="assignment_requests_status_check"),
        # An engineer can have at most one pending request per incident.
        Index("assignment_requests_one_pending", "incident_id", "engineer_id", unique=True,
              postgresql_where=text("status = 'pending'")),
        Index("assignment_requests_status_idx", "status"),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    incident_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("incidents.id", ondelete="CASCADE"))
    engineer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    message: Mapped[Optional[str]] = mapped_column(Text)
    decided_by_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    decision_note: Mapped[Optional[str]] = mapped_column(Text)
    decided_at: Mapped[Optional[datetime]] = mapped_column(_TIMESTAMP)
    created_at: Mapped[datetime] = mapped_column(_TIMESTAMP, server_default=func.now())

    incident: Mapped[Incident] = relationship(lazy="joined")
    engineer: Mapped[User] = relationship(foreign_keys=[engineer_id], lazy="joined")
    decided_by: Mapped[Optional[User]] = relationship(foreign_keys=[decided_by_id], lazy="joined")
