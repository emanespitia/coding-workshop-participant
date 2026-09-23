"""
Facilities business rules: lookups with 404s, duplicate names and in-use deletes as 409s.
"""

from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import integrity_guard
from app.core.errors import ConflictError, NotFoundError
from app.facilities.models import Building, Floor, Seat

_IN_USE = "is referenced by incidents and cannot be deleted"


def _contains(column: Any, q: Optional[str]) -> Any:
    """Case-insensitive 'contains' filter (no LIKE wildcards to escape)."""
    return func.strpos(func.lower(column), q.lower()) > 0


def _get(session: Session, model: type, obj_id: int, label: str) -> Any:
    obj = session.get(model, obj_id)
    if obj is None:
        raise NotFoundError(f"{label} not found")
    return obj


def _save(session: Session, obj: Any, duplicate: ConflictError) -> Any:
    """Flush pending changes, turning unique violations into a 409, and reload computed fields."""
    with integrity_guard(duplicate=duplicate):
        session.flush()
    session.refresh(obj)
    return obj


def _delete(session: Session, obj: Any, label: str) -> None:
    with integrity_guard(in_use=ConflictError(f"This {label} {_IN_USE}", code="IN_USE")):
        with session.begin_nested():
            session.delete(obj)


# ---- Buildings --------------------------------------------------------------

def _duplicate_building() -> ConflictError:
    return ConflictError("A building with this name already exists", code="DUPLICATE_NAME",
                         fields={"name": "Already in use"})


def list_buildings(session: Session, q: Optional[str]) -> list[Building]:
    """All buildings ordered by name, optionally filtered by name or address."""
    query = select(Building).order_by(func.lower(Building.name))
    if q:
        query = query.where(_contains(Building.name, q) | _contains(func.coalesce(Building.address, ""), q))
    return list(session.scalars(query).all())


def get_building(session: Session, building_id: int) -> Building:
    """A building (404 if missing)."""
    return _get(session, Building, building_id, "Building")


def create_building(session: Session, fields: dict[str, Any]) -> Building:
    """Create a building."""
    building = Building(**fields)
    session.add(building)
    return _save(session, building, _duplicate_building())


def update_building(session: Session, building_id: int, fields: dict[str, Any]) -> Building:
    """Rename a building or change its address."""
    building = get_building(session, building_id)
    for name, value in fields.items():
        setattr(building, name, value)
    return _save(session, building, _duplicate_building())


def delete_building(session: Session, building_id: int) -> None:
    """Delete a building and (via the database) its floors and seats."""
    _delete(session, get_building(session, building_id), "building")


# ---- Floors -----------------------------------------------------------------

def _duplicate_floor() -> ConflictError:
    return ConflictError("This building already has a floor with this name", code="DUPLICATE_NAME",
                         fields={"name": "Already in use"})


def list_floors(session: Session, building_id: int) -> list[Floor]:
    """Floors of a building, ordered by level."""
    return list(get_building(session, building_id).floors)


def get_floor(session: Session, floor_id: int) -> Floor:
    """A floor (404 if missing)."""
    return _get(session, Floor, floor_id, "Floor")


def create_floor(session: Session, building_id: int, fields: dict[str, Any]) -> Floor:
    """Add a floor to a building."""
    get_building(session, building_id)
    floor = Floor(building_id=building_id, **fields)
    session.add(floor)
    return _save(session, floor, _duplicate_floor())


def update_floor(session: Session, floor_id: int, fields: dict[str, Any]) -> Floor:
    """Rename or re-order a floor."""
    floor = get_floor(session, floor_id)
    for name, value in fields.items():
        setattr(floor, name, value)
    return _save(session, floor, _duplicate_floor())


def delete_floor(session: Session, floor_id: int) -> None:
    """Delete a floor and (via the database) its seats."""
    _delete(session, get_floor(session, floor_id), "floor")


# ---- Seats ------------------------------------------------------------------

def _duplicate_seat() -> ConflictError:
    return ConflictError("This floor already has a seat with this code", code="DUPLICATE_CODE",
                         fields={"code": "Already in use"})


def list_seats(session: Session, floor_id: int, q: Optional[str]) -> list[Seat]:
    """Seats of a floor ordered by code, optionally filtered by code."""
    get_floor(session, floor_id)
    query = select(Seat).where(Seat.floor_id == floor_id).order_by(Seat.code)
    if q:
        query = query.where(_contains(Seat.code, q))
    return list(session.scalars(query).all())


def get_seat(session: Session, seat_id: int) -> Seat:
    """A seat (404 if missing)."""
    return _get(session, Seat, seat_id, "Seat")


def create_seat(session: Session, floor_id: int, fields: dict[str, Any]) -> Seat:
    """Add a seat to a floor."""
    get_floor(session, floor_id)
    seat = Seat(floor_id=floor_id, **fields)
    session.add(seat)
    return _save(session, seat, _duplicate_seat())


def update_seat(session: Session, seat_id: int, fields: dict[str, Any]) -> Seat:
    """Change a seat's code."""
    seat = get_seat(session, seat_id)
    for name, value in fields.items():
        setattr(seat, name, value)
    return _save(session, seat, _duplicate_seat())


def delete_seat(session: Session, seat_id: int) -> None:
    """Delete a seat."""
    _delete(session, get_seat(session, seat_id), "seat")
