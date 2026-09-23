"""
Facilities endpoints. Any signed-in user can read (employees pick a location
when reporting an incident); only admins can create, edit or delete.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.facilities import service
from app.facilities.schemas import (
    BuildingCreate,
    BuildingListResponse,
    BuildingResponse,
    BuildingUpdate,
    FloorCreate,
    FloorListResponse,
    FloorResponse,
    FloorUpdate,
    SearchQuery,
    SeatCreate,
    SeatListResponse,
    SeatResponse,
    SeatUpdate,
)

router = APIRouter(tags=["facilities"])

Search = Annotated[SearchQuery, Query()]
NO_CONTENT = {"status_code": status.HTTP_204_NO_CONTENT, "response_class": Response}


# ---- Buildings --------------------------------------------------------------

@router.get("/buildings", response_model=BuildingListResponse)
def list_buildings(search: Search, db: DbSession, _: CurrentUser) -> dict:
    """List buildings, optionally filtered by `q` (name or address)."""
    return {"items": service.list_buildings(db, search.q)}


@router.post("/buildings", response_model=BuildingResponse, status_code=status.HTTP_201_CREATED)
def create_building(body: BuildingCreate, db: DbSession, _: AdminUser) -> dict:
    """Create a building. **Admin only.**"""
    return {"building": service.create_building(db, body.model_dump())}


@router.get("/buildings/{building_id}", response_model=BuildingResponse)
def get_building(building_id: int, db: DbSession, _: CurrentUser) -> dict:
    """A building with its floors (ordered by level)."""
    return {"building": service.get_building(db, building_id)}


@router.patch("/buildings/{building_id}", response_model=BuildingResponse)
def update_building(building_id: int, body: BuildingUpdate, db: DbSession, _: AdminUser) -> dict:
    """Rename a building or change its address. **Admin only.**"""
    return {"building": service.update_building(db, building_id, body.model_dump(exclude_unset=True))}


@router.delete("/buildings/{building_id}", **NO_CONTENT)
def delete_building(building_id: int, db: DbSession, _: AdminUser) -> None:
    """Delete a building with all its floors and seats (409 if incidents reference it). **Admin only.**"""
    service.delete_building(db, building_id)


# ---- Floors -----------------------------------------------------------------

@router.get("/buildings/{building_id}/floors", response_model=FloorListResponse)
def list_floors(building_id: int, db: DbSession, _: CurrentUser) -> dict:
    """Floors of a building, ordered by level."""
    return {"items": service.list_floors(db, building_id)}


@router.post("/buildings/{building_id}/floors", response_model=FloorResponse,
             status_code=status.HTTP_201_CREATED)
def create_floor(building_id: int, body: FloorCreate, db: DbSession, _: AdminUser) -> dict:
    """Add a floor to a building. **Admin only.**"""
    return {"floor": service.create_floor(db, building_id, body.model_dump())}


@router.get("/floors/{floor_id}", response_model=FloorResponse)
def get_floor(floor_id: int, db: DbSession, _: CurrentUser) -> dict:
    """A floor."""
    return {"floor": service.get_floor(db, floor_id)}


@router.patch("/floors/{floor_id}", response_model=FloorResponse)
def update_floor(floor_id: int, body: FloorUpdate, db: DbSession, _: AdminUser) -> dict:
    """Rename or re-order a floor. **Admin only.**"""
    return {"floor": service.update_floor(db, floor_id, body.model_dump(exclude_unset=True))}


@router.delete("/floors/{floor_id}", **NO_CONTENT)
def delete_floor(floor_id: int, db: DbSession, _: AdminUser) -> None:
    """Delete a floor with all its seats (409 if incidents reference it). **Admin only.**"""
    service.delete_floor(db, floor_id)


# ---- Seats ------------------------------------------------------------------

@router.get("/floors/{floor_id}/seats", response_model=SeatListResponse)
def list_seats(floor_id: int, search: Search, db: DbSession, _: CurrentUser) -> dict:
    """Seats of a floor, optionally filtered by `q` (seat code)."""
    return {"items": service.list_seats(db, floor_id, search.q)}


@router.post("/floors/{floor_id}/seats", response_model=SeatResponse, status_code=status.HTTP_201_CREATED)
def create_seat(floor_id: int, body: SeatCreate, db: DbSession, _: AdminUser) -> dict:
    """Add a seat to a floor. **Admin only.**"""
    return {"seat": service.create_seat(db, floor_id, body.model_dump())}


@router.get("/seats/{seat_id}", response_model=SeatResponse)
def get_seat(seat_id: int, db: DbSession, _: CurrentUser) -> dict:
    """A seat."""
    return {"seat": service.get_seat(db, seat_id)}


@router.patch("/seats/{seat_id}", response_model=SeatResponse)
def update_seat(seat_id: int, body: SeatUpdate, db: DbSession, _: AdminUser) -> dict:
    """Change a seat's code. **Admin only.**"""
    return {"seat": service.update_seat(db, seat_id, body.model_dump(exclude_unset=True))}


@router.delete("/seats/{seat_id}", **NO_CONTENT)
def delete_seat(seat_id: int, db: DbSession, _: AdminUser) -> None:
    """Delete a seat (409 if incidents reference it). **Admin only.**"""
    service.delete_seat(db, seat_id)
