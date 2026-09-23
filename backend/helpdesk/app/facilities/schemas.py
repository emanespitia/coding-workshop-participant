"""
Request and response models for buildings, floors and seats.
"""

from datetime import datetime
from typing import Annotated, ClassVar, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.core.schemas import Name, PatchModel, QueryModel, StrictModel

Address = Annotated[
    Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]],
    AfterValidator(lambda value: value or None),  # "" clears the address
]
FloorName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
FloorLevel = Annotated[int, Field(ge=-20, le=300)]
SeatCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class SearchQuery(QueryModel):
    """Optional ?q= text filter."""

    q: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]] = None


# ---- Buildings --------------------------------------------------------------

class BuildingCreate(StrictModel):
    """POST /buildings."""

    name: Name
    address: Address = None


class BuildingUpdate(PatchModel):
    """PATCH /buildings/{id}."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset({"address"})

    name: Name = None
    address: Address = None


class BuildingPublic(BaseModel):
    """A building with its number of floors."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: Optional[str] = None
    floor_count: int
    created_at: datetime
    updated_at: datetime


# ---- Floors -----------------------------------------------------------------

class FloorCreate(StrictModel):
    """POST /buildings/{id}/floors."""

    name: FloorName
    level: FloorLevel


class FloorUpdate(PatchModel):
    """PATCH /floors/{id}."""

    name: FloorName = None
    level: FloorLevel = None


class FloorPublic(BaseModel):
    """A floor with its number of seats."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    building_id: int
    name: str
    level: int
    seat_count: int
    created_at: datetime
    updated_at: datetime


class BuildingDetail(BuildingPublic):
    """A building including its floors (ordered by level)."""

    floors: list[FloorPublic]


# ---- Seats ------------------------------------------------------------------

class SeatCreate(StrictModel):
    """POST /floors/{id}/seats."""

    code: SeatCode


class SeatUpdate(PatchModel):
    """PATCH /seats/{id}."""

    code: SeatCode = None


class SeatPublic(BaseModel):
    """A seat."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    floor_id: int
    code: str
    created_at: datetime
    updated_at: datetime


# ---- Envelopes --------------------------------------------------------------

class BuildingResponse(BaseModel):
    """Single building envelope."""

    building: BuildingDetail


class BuildingListResponse(BaseModel):
    """All buildings (optionally filtered)."""

    items: list[BuildingPublic]


class FloorResponse(BaseModel):
    """Single floor envelope."""

    floor: FloorPublic


class FloorListResponse(BaseModel):
    """Floors of a building, ordered by level."""

    items: list[FloorPublic]


class SeatResponse(BaseModel):
    """Single seat envelope."""

    seat: SeatPublic


class SeatListResponse(BaseModel):
    """Seats of a floor, ordered by code."""

    items: list[SeatPublic]
