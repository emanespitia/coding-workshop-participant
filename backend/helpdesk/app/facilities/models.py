"""
ORM models for facilities: buildings contain floors, floors contain seats.

Deleting a building or floor cascades to its children in the database. Once
incidents reference a location, their foreign keys block that delete.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Text,
    func,
    select,
    text,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.core.orm import Base


class Building(Base):
    """An office building."""

    __tablename__ = "buildings"
    __table_args__ = (
        # Names are unique regardless of case ("HQ" and "hq" are the same building).
        Index("buildings_name_key", text("lower(name)"), unique=True),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    address: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    floors: Mapped[list["Floor"]] = relationship(
        back_populates="building", order_by="Floor.level", passive_deletes=True,
    )


class Floor(Base):
    """
    A floor within a building. `level` orders floors (e.g. -1 basement, 0 ground).

    Floor names are unique per building, regardless of case.
    """

    __tablename__ = "floors"
    __table_args__ = (
        Index("floors_building_name_key", "building_id", text("lower(name)"), unique=True),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    building_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("buildings.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    level: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    building: Mapped[Building] = relationship(back_populates="floors")
    seats: Mapped[list["Seat"]] = relationship(
        back_populates="floor", order_by="Seat.code", passive_deletes=True,
    )


class Seat(Base):
    """A seat or desk on a floor, identified by a code such as "3A-12" (unique per floor, any case)."""

    __tablename__ = "seats"
    __table_args__ = (
        Index("seats_floor_code_key", "floor_id", text("lower(code)"), unique=True),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    floor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("floors.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    floor: Mapped[Floor] = relationship(back_populates="seats")


# Child counts, computed by the database whenever the parent is loaded.
Building.floor_count = column_property(
    select(func.count(Floor.id)).where(Floor.building_id == Building.id).correlate_except(Floor).scalar_subquery()
)
Floor.seat_count = column_property(
    select(func.count(Seat.id)).where(Seat.floor_id == Floor.id).correlate_except(Seat).scalar_subquery()
)
