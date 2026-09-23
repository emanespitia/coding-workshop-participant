"""
Local demo data: users for every role and a few buildings with floors and seats.

Runs automatically when the local server starts with SEED_DEMO_DATA=true
(see .env.sample). It only adds what is missing, so restarting never creates
duplicates; demo records you delete come back on the next start.

Every demo account uses the password DEMO_PASSWORD. Never enabled on AWS.

Manual use (from backend/helpdesk):
    .venv/bin/python -m app.seed            # add missing demo data
    .venv/bin/python -m app.seed --reset    # wipe the local database, then seed
"""

import argparse
import logging
import os
import sys

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core import config, security
from app.core.constants import ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_ENGINEER
from app.facilities.models import Building, Floor, Seat
from app.users.models import EngineerProfile, User

logger = logging.getLogger(__name__)

DEMO_PASSWORD = "Password123"

# (email, full name, role, engineer profile)
USERS = [
    ("admin@acme.inc", "Alex Admin", ROLE_ADMIN, None),
    ("morgan.facilities@acme.inc", "Morgan Facilities", ROLE_ADMIN, None),
    ("sam.rivera@acme.inc", "Sam Rivera", ROLE_ENGINEER,
     {"specialties": ["hvac", "electrical"], "availability": "available", "phone": "555-0101"}),
    ("priya.shah@acme.inc", "Priya Shah", ROLE_ENGINEER,
     {"specialties": ["network", "it_hardware", "av_equipment"], "availability": "available",
      "phone": "555-0102"}),
    ("diego.martinez@acme.inc", "Diego Martinez", ROLE_ENGINEER,
     {"specialties": ["plumbing", "cleaning"], "availability": "busy", "phone": None}),
    ("lee.chen@acme.inc", "Lee Chen", ROLE_ENGINEER,
     {"specialties": ["security", "access_control"], "availability": "off_duty", "phone": "555-0104"}),
    ("jane.doe@acme.inc", "Jane Doe", ROLE_EMPLOYEE, None),
    ("john.smith@acme.inc", "John Smith", ROLE_EMPLOYEE, None),
    ("maria.garcia@acme.inc", "Maria Garcia", ROLE_EMPLOYEE, None),
]

# building name -> (address, [(floor name, level, seat-code prefix, number of seats)])
BUILDINGS = {
    "HQ Tower": ("100 Main St, Springfield", [
        ("Basement", -1, "B", 2),
        ("Ground", 0, "G", 4),
        ("Floor 1", 1, "1A", 6),
        ("Floor 2", 2, "2A", 6),
    ]),
    "Riverside Annex": ("25 River Rd, Springfield", [
        ("Ground", 0, "RG", 3),
        ("Floor 1", 1, "R1", 4),
    ]),
    "Innovation Lab": ("8 Tech Park Way, Springfield", [
        ("Ground", 0, "LAB", 4),
    ]),
}


def _seed_users(session: Session, password_hash: str) -> int:
    existing = set(session.scalars(select(User.email)).all())
    created = 0
    for email, full_name, role, profile in USERS:
        if email in existing:
            continue
        user = User(email=email, full_name=full_name, role=role, password_hash=password_hash,
                    must_change_password=False, password_changed_at=func.now())
        if profile:
            user.engineer_profile = EngineerProfile(**profile)
        session.add(user)
        created += 1
    return created


def _seed_facilities(session: Session) -> int:
    created = 0
    for name, (address, floors) in BUILDINGS.items():
        building = session.scalar(select(Building).where(func.lower(Building.name) == name.lower()))
        if building is None:
            building = Building(name=name, address=address)
            session.add(building)
            session.flush()
            created += 1
        for floor_name, level, prefix, seat_count in floors:
            floor = session.scalar(select(Floor).where(
                Floor.building_id == building.id, func.lower(Floor.name) == floor_name.lower()))
            if floor is None:
                floor = Floor(building_id=building.id, name=floor_name, level=level)
                session.add(floor)
                session.flush()
                created += 1
            existing = {c.lower() for c in session.scalars(select(Seat.code).where(Seat.floor_id == floor.id))}
            for number in range(1, seat_count + 1):
                code = f"{prefix}-{number:02d}"
                if code.lower() not in existing:
                    session.add(Seat(floor_id=floor.id, code=code))
                    created += 1
    return created


def run(session: Session) -> None:
    """Add any missing demo users, buildings, floors and seats."""
    password_hash = security.hash_password(DEMO_PASSWORD)
    users = _seed_users(session, password_hash)
    places = _seed_facilities(session)
    session.flush()
    if users or places:
        logger.info("Demo data: added %s users and %s buildings/floors/seats (password: %s)",
                    users, places, DEMO_PASSWORD)


def reset(session: Session) -> None:
    """Delete everything in the local database (all app tables)."""
    from app.core.orm import Base  # pylint: disable=import-outside-toplevel

    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


def main() -> None:
    """Command-line entry point: python -m app.seed [--reset]."""
    from app.core import db  # pylint: disable=import-outside-toplevel

    parser = argparse.ArgumentParser(description="Seed the local database with demo data.")
    parser.add_argument("--reset", action="store_true", help="wipe all app tables first")
    args = parser.parse_args()

    if not config.is_local() or config.running_on_lambda():
        sys.exit("Refusing to seed: IS_LOCAL is not 'true' (demo accounts have known passwords).")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    os.environ["SEED_DEMO_DATA"] = "false"  # seeded explicitly below, not during schema init
    db.init_schema()
    with db.session_scope() as session:
        if args.reset:
            reset(session)
            logger.info("Local database wiped")
        run(session)
    print(f"Done. Sign in as admin@acme.inc (or any demo user) with password {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
