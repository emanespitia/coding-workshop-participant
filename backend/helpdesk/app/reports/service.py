"""
Dashboard numbers, computed with SQL aggregates.

Scope depends on the caller: admins report on every incident, engineers on
incidents assigned to them, employees on incidents they reported. "Window"
metrics use incidents reported in the last `days` days.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import Date, and_, cast, extract, func, select, true
from sqlalchemy.orm import Session

from app.core.constants import (
    ACTIVE_STATUSES,
    PRIORITIES,
    ROLE_ADMIN,
    ROLE_ENGINEER,
    STATUS_BLOCKED,
    STATUS_OPEN,
    STATUSES,
)
from app.facilities.models import Building, Floor, Seat
from app.incidents.models import AssignmentRequest, Incident, IncidentEvent, IncidentNote
from app.reports.schemas import SummaryQuery
from app.users.models import EngineerProfile, User

_ATTENTION_LIMIT = 10
_HOTSPOT_LIMIT = 5


def _hours(start: Any, end: Any) -> Any:
    """SQL: hours between two timestamps."""
    return extract("epoch", end - start) / 3600.0


def _round(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(float(value), 2)


def _pct(part: int, whole: int) -> Optional[float]:
    return None if not whole else round(100.0 * part / whole, 1)


def _count(*conditions: Any) -> Any:
    """SQL: count(*) FILTER (WHERE ...)."""
    return func.count().filter(and_(*conditions))


def _scope(user: User) -> tuple[str, Any]:
    if user.role == ROLE_ADMIN:
        return "all", true()
    if user.role == ROLE_ENGINEER:
        return "assigned", Incident.assignee_id == user.id
    return "reported", Incident.reporter_id == user.id


def summary(session: Session, user: User, query: SummaryQuery) -> dict:
    """Build the dashboard for this user."""
    scope, scope_condition = _scope(user)
    base = [scope_condition]
    if query.building_id is not None:
        base.append(Incident.building_id == query.building_id)
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=query.days)
    in_window = Incident.created_at >= window_start
    is_admin = user.role == ROLE_ADMIN

    return {
        "scope": scope,
        "window_days": query.days,
        "generated_at": now,
        "totals": _totals(session, user, base, window_start, query.building_id),
        "by_status": _by(session, Incident.status, base, STATUSES),
        "by_priority": list(reversed(_by(session, Incident.priority,
                                         base + [Incident.status.in_(ACTIVE_STATUSES)], PRIORITIES))),
        "by_category": [c for c in _by(session, Incident.category, base + [in_window]) if c["count"]],
        "response_times": _response_times(session, base + [in_window]),
        "attention": _attention(session, base),
        "trend": _trend(session, base, window_start.date(), now.date()),
        "communication": None if user.role == ROLE_ENGINEER else _communication(session, base + [in_window]),
        "workload": _workload(session, window_start, query.building_id) if is_admin else None,
        "hotspots": _hotspots(session, base + [in_window]) if is_admin else None,
    }


def _totals(session: Session, user: User, base: list, window_start: datetime,
            building_id: Optional[int]) -> dict:
    active = Incident.status.in_(ACTIVE_STATUSES)
    row = session.execute(select(
        func.count(),
        _count(active),
        _count(Incident.status == STATUS_OPEN, Incident.assignee_id.is_(None)),
        _count(Incident.is_escalated, active),
        _count(Incident.created_at >= window_start),
        _count(Incident.resolved_at >= window_start),
    ).where(*base)).one()
    totals = dict(zip(("total", "active", "unassigned_open", "escalated_active",
                       "reported_in_window", "resolved_in_window"), row))
    if user.role == ROLE_ENGINEER:
        pool = [Incident.status == STATUS_OPEN, Incident.assignee_id.is_(None)]
        if building_id is not None:
            pool.append(Incident.building_id == building_id)
        totals["available_pool"] = session.scalar(select(func.count()).select_from(Incident).where(*pool))
    return totals


def _by(session: Session, column: Any, conditions: list, keys: Optional[tuple] = None) -> list[dict]:
    """Counts grouped by a column; with `keys`, every key is listed (zeros included) in that order."""
    counts = dict(session.execute(
        select(column, func.count()).where(*conditions).group_by(column)
    ).all())
    if keys is not None:
        return [{"key": key, "count": counts.get(key, 0)} for key in keys]
    return [{"key": key, "count": n} for key, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def _response_times(session: Session, conditions: list) -> dict:
    result = {}
    for name, column in (("acknowledge", Incident.acknowledged_at), ("assign", Incident.assigned_at),
                         ("resolve", Incident.resolved_at)):
        hours = _hours(Incident.created_at, column)
        count, avg, median = session.execute(
            select(func.count(), func.avg(hours), func.percentile_cont(0.5).within_group(hours))
            .where(*conditions, column.is_not(None))
        ).one()
        result[name] = {"count": count, "avg_hours": _round(avg), "median_hours": _round(median)}
    return result


def _attention(session: Session, base: list) -> dict:
    escalated = session.scalars(
        select(Incident).where(*base, Incident.is_escalated, Incident.status.in_(ACTIVE_STATUSES))
        .order_by(Incident.escalated_at.desc()).limit(_ATTENTION_LIMIT)
    ).unique().all()

    blocked_since = (
        select(func.max(IncidentEvent.created_at))
        .where(IncidentEvent.incident_id == Incident.id, IncidentEvent.type == "status_changed",
               IncidentEvent.to_value == STATUS_BLOCKED)
        .correlate(Incident).scalar_subquery()
    )
    blocked = session.execute(
        select(Incident, blocked_since.label("since"))
        .where(*base, Incident.status == STATUS_BLOCKED)
        .order_by(blocked_since.asc()).limit(_ATTENTION_LIMIT)
    ).unique().all()

    def item(incident: Incident, reason: Optional[str], since: Optional[datetime]) -> dict:
        return {"id": incident.id, "title": incident.title, "status": incident.status,
                "priority": incident.priority, "reason": reason, "since": since,
                "assignee_name": incident.assignee.full_name if incident.assignee else None}

    return {
        "escalated": [item(i, i.escalation_reason, i.escalated_at) for i in escalated],
        "blocked": [item(i, i.blocked_reason, since) for i, since in blocked],
    }


def _utc_day(column: Any) -> Any:
    return cast(func.timezone("UTC", column), Date)


def _trend(session: Session, base: list, first_day: date, last_day: date) -> list[dict]:
    def per_day(column: Any) -> dict:
        day = _utc_day(column)
        return dict(session.execute(
            select(day, func.count()).where(*base, day >= first_day).group_by(day)
        ).all())

    reported, resolved = per_day(Incident.created_at), per_day(Incident.resolved_at)
    days = (last_day - first_day).days + 1
    return [
        {"date": d, "reported": reported.get(d, 0), "resolved": resolved.get(d, 0)}
        for d in (first_day + timedelta(days=i) for i in range(days))
    ]


def _communication(session: Session, conditions: list) -> dict:
    """Do engineers/admins write to the reporter, and how soon?"""
    first_staff_note = (
        select(IncidentNote.incident_id, func.min(IncidentNote.created_at).label("first_at"))
        .join(Incident, Incident.id == IncidentNote.incident_id)
        .where(IncidentNote.author_id != Incident.reporter_id)
        .group_by(IncidentNote.incident_id)
        .subquery()
    )
    incidents, with_note, avg_hours = session.execute(
        select(func.count(), func.count(first_staff_note.c.first_at),
               func.avg(_hours(Incident.created_at, first_staff_note.c.first_at)))
        .select_from(Incident)
        .outerjoin(first_staff_note, first_staff_note.c.incident_id == Incident.id)
        .where(*conditions)
    ).one()
    return {
        "incidents": incidents,
        "with_staff_note": with_note,
        "with_staff_note_pct": _pct(with_note, incidents),
        "avg_hours_to_first_staff_note": _round(avg_hours),
    }


def _workload(session: Session, window_start: datetime, building_id: Optional[int]) -> list[dict]:
    """Every active engineer with their current load, busiest first."""
    incident_filter = [Incident.assignee_id.is_not(None)]
    if building_id is not None:
        incident_filter.append(Incident.building_id == building_id)
    loads = {
        row[0]: row[1:] for row in session.execute(
            select(
                Incident.assignee_id,
                _count(Incident.status.in_(ACTIVE_STATUSES)),
                _count(Incident.status == "open"),
                _count(Incident.status == "in_progress"),
                _count(Incident.status == STATUS_BLOCKED),
                _count(Incident.resolved_at >= window_start),
            ).where(*incident_filter).group_by(Incident.assignee_id)
        ).all()
    }
    pending = dict(session.execute(
        select(AssignmentRequest.engineer_id, func.count())
        .where(AssignmentRequest.status == "pending").group_by(AssignmentRequest.engineer_id)
    ).all())
    engineers = session.execute(
        select(User.id, User.full_name, EngineerProfile.availability, EngineerProfile.specialties)
        .join(EngineerProfile, EngineerProfile.user_id == User.id)
        .where(User.role == ROLE_ENGINEER, User.is_active)
    ).all()

    load_fields = ("active", "open", "in_progress", "blocked", "resolved_in_window")
    rows = [
        {
            "id": engineer.id, "full_name": engineer.full_name, "availability": engineer.availability,
            "specialties": engineer.specialties, "pending_requests": pending.get(engineer.id, 0),
            **dict(zip(load_fields, loads.get(engineer.id, (0,) * len(load_fields)))),
        }
        for engineer in engineers
    ]
    return sorted(rows, key=lambda r: (-r["active"], r["full_name"]))


def _hotspots(session: Session, conditions: list) -> dict:
    """Locations with the most incidents reported in the window."""
    def top(group_by: list, label: Any, join: list, extra: Optional[list] = None) -> list[dict]:
        query = select(group_by[0], label, func.count().label("n")).select_from(Incident)
        for target, on in join:
            query = query.join(target, on)
        rows = session.execute(
            query.where(*conditions, *(extra or [])).group_by(*group_by, label)
            .order_by(func.count().desc(), label).limit(_HOTSPOT_LIMIT)
        ).all()
        return [{"id": row[0], "label": row[1], "count": row[2]} for row in rows]

    building_join = (Building, Building.id == Incident.building_id)
    floor_join = (Floor, Floor.id == Incident.floor_id)
    seat_join = (Seat, Seat.id == Incident.seat_id)
    return {
        "buildings": top([Building.id], Building.name, [building_join]),
        "floors": top([Floor.id], func.concat(Building.name, " · ", Floor.name), [building_join, floor_join]),
        "seats": top([Seat.id], func.concat(Building.name, " · ", Floor.name, " · ", Seat.code),
                     [building_join, floor_join, seat_join]),
    }
