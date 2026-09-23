"""
Local demo data: users for every role (including a deactivated account and one
that must change its password), a few buildings with floors and seats, and
incidents that go through every workflow step, with backdated history, notes
and assignment requests spread over the last 30 days (plus one older one).

Runs automatically when the local server starts with SEED_DEMO_DATA=true
(see .env.sample). It only adds what is missing, so restarting never creates
duplicates; demo users and places you delete come back on the next start.
Demo incidents are only created when there are no incidents at all.

Every demo account uses the password DEMO_PASSWORD. Never enabled on AWS.

Manual use (from backend/helpdesk):
    .venv/bin/python -m app.seed            # add missing demo data
    .venv/bin/python -m app.seed --reset    # wipe the local database, then seed
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core import config, security
from app.core.constants import ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_ENGINEER, STATUS_BLOCKED
from app.facilities.models import Building, Floor, Seat
from app.incidents.models import AssignmentRequest, Incident, IncidentEvent, IncidentNote
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
    ("tom.okafor@acme.inc", "Tom Okafor", ROLE_ENGINEER,
     {"specialties": ["furniture", "other"], "availability": "available", "phone": "555-0105"}),
    ("jane.doe@acme.inc", "Jane Doe", ROLE_EMPLOYEE, None),
    ("john.smith@acme.inc", "John Smith", ROLE_EMPLOYEE, None),
    ("maria.garcia@acme.inc", "Maria Garcia", ROLE_EMPLOYEE, None),
    ("nina.patel@acme.inc", "Nina Patel", ROLE_EMPLOYEE, None),
    ("chris.taylor@acme.inc", "Chris Taylor", ROLE_EMPLOYEE, None),
]

# Accounts that show other states in user management.
ACCOUNT_FLAGS = {
    "nina.patel@acme.inc": {"must_change_password": True},  # new hire: sets a password at first sign-in
    "chris.taylor@acme.inc": {"is_active": False},          # left the company; their history is kept
}

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
        flags = {"must_change_password": False, **ACCOUNT_FLAGS.get(email, {})}
        user = User(email=email, full_name=full_name, role=role, password_hash=password_hash,
                    password_changed_at=func.now(), **flags)
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


# ---- Incidents --------------------------------------------------------------------
#
# Each incident is a timeline of steps, (action, hours after it was reported, *args):
#   ("assign", h, engineer)      ("unassign", h)               ("start", h)
#   ("block", h, reason)         ("unblock", h)                ("resolve", h, resolution)
#   ("reopen", h, reason)        ("close", h, reason_or_None)  ("cancel", h, reason)
#   ("escalate", h, reason)      ("deescalate", h)             ("priority", h, new_priority)
#   ("edit", h, {field: value})  ("note", h, author, text)     ("request", h, engineer, message)
#   ("reject", h, engineer, note)                              ("withdraw", h, engineer)
# Admin actions (assign, reopen, close, deescalate, priority, reject) are by admin@acme.inc,
# start/block/unblock/resolve by the assignee, and cancel/escalate/edit by the reporter.

_ADMIN = "admin@acme.inc"
_SAM, _PRIYA, _DIEGO = "sam.rivera@acme.inc", "priya.shah@acme.inc", "diego.martinez@acme.inc"
_LEE, _TOM = "lee.chen@acme.inc", "tom.okafor@acme.inc"
_JANE, _JOHN, _MARIA, _CHRIS = "jane.doe@acme.inc", "john.smith@acme.inc", "maria.garcia@acme.inc", \
    "chris.taylor@acme.inc"
_DAY = 24

# (title, description, category, priority, reporter, (building, floor, seat code), reported hours ago, steps)
INCIDENTS = [
    ("Air conditioning not cooling on Floor 2", "It's about 29C near the windows since this morning.",
     "hvac", "high", _JANE, ("HQ Tower", "Floor 2", "2A-03"), 3,
     [("escalate", 1, "Several people are working from the kitchen because of the heat")]),
    ("Projector in Lab won't turn on", "No power light at all; the demo is on Thursday.",
     "av_equipment", "medium", _JOHN, ("Innovation Lab", "Ground", "LAB-02"), 5,
     [("request", 1, _PRIYA, "I know this model, can take it this afternoon")]),
    ("Wi-Fi drops every few minutes in the Annex", "Affects the whole first floor, laptops and phones.",
     "network", "critical", _MARIA, ("Riverside Annex", "Floor 1", None), 26,
     [("assign", 0.5, _PRIYA), ("start", 1), ("note", 2, _PRIYA, "Access point firmware looks outdated."),
      ("note", 3, _MARIA, "Still dropping, meetings are affected.")]),
    ("Desk lamp flickering", "The lamp at my desk flickers constantly.",
     "electrical", "low", _JANE, ("HQ Tower", "Floor 1", "1A-04"), 50,
     [("assign", 4, _SAM), ("start", 20)]),
    ("Leaking pipe under kitchen sink", "Water pooling on the floor, I put a bucket under it.",
     "plumbing", "high", _JOHN, ("HQ Tower", "Ground", None), 30,
     [("assign", 1, _DIEGO), ("start", 2), ("block", 3, "Waiting for a replacement valve (ETA Friday)"),
      ("note", 3.5, _DIEGO, "Water is shut off at the valve; the bucket can go.")]),
    ("Badge reader at side door rejects all badges", "Red light for every badge since the weekend.",
     "access_control", "high", _MARIA, ("Riverside Annex", "Ground", None), 70,
     [("escalate", 2, "Staff have to walk around to the main entrance"), ("assign", 3, _LEE), ("start", 4),
      ("block", 6, "Vendor needs to replace the controller board")]),
    ("Broken chair at hot desk 1A-02", "Back rest snapped off.",
     "furniture", "low", _JOHN, ("HQ Tower", "Floor 1", "1A-02"), 120,
     [("assign", 6, _DIEGO), ("start", 24), ("resolve", 26, "Replaced with a new chair from storage.")]),
    ("Monitor has dead pixels", "A line of dead pixels down the middle of the screen.",
     "it_hardware", "medium", _JANE, ("HQ Tower", "Floor 2", "2A-01"), 96,
     [("request", 1, _PRIYA, None), ("assign", 2, _PRIYA), ("start", 3),
      ("resolve", 8, "Swapped the monitor; old one sent for warranty repair.")]),
    ("Restroom out of paper towels", "Ground floor restroom, both dispensers empty.",
     "cleaning", "low", _MARIA, ("HQ Tower", "Ground", None), 170,
     [("assign", 1, _DIEGO), ("start", 1.5), ("resolve", 2, "Refilled; added to the daily checklist."),
      ("close", 30, None)]),
    ("Server room temperature alarm", "Alarm panel shows 31C in the basement server room.",
     "hvac", "critical", _JOHN, ("HQ Tower", "Basement", None), 200,
     [("escalate", 0.2, "Risk of hardware damage"), ("assign", 0.3, _SAM), ("start", 0.5),
      ("note", 1, _SAM, "Backup cooling unit started, temperature dropping."),
      ("resolve", 4, "Main unit compressor replaced; temperature back to 21C."), ("close", 48, None)]),
    ("Ethernet port dead at LAB-03", "No link light on the wall port.",
     "network", "medium", _JANE, ("Innovation Lab", "Ground", "LAB-03"), 260,
     [("assign", 5, _PRIYA), ("start", 20), ("resolve", 22, "Re-terminated the cable at the patch panel."),
      ("close", 72, None)]),
    ("Meeting room screen shows no signal", "HDMI cable seems fine.",
     "av_equipment", "medium", _MARIA, ("HQ Tower", "Floor 1", None), 140,
     [("cancel", 2, "Wrong input selected on the remote, works now")]),
    ("Security camera offline in lobby", "Camera 3 feed is black on the monitor.",
     "security", "high", _JOHN, ("HQ Tower", "Ground", "G-01"), 45,
     [("request", 2, _LEE, "Camera system is my area"), ("request", 3, _SAM, None)]),
    ("Power outlet sparks when plugging in", "Outlet next to seat RG-02 sparked twice.",
     "electrical", "high", _MARIA, ("Riverside Annex", "Ground", "RG-02"), 10,
     [("priority", 0.5, "critical"), ("assign", 0.6, _SAM), ("start", 1),
      ("note", 1.2, _SAM, "Circuit isolated; do not use this outlet.")]),
    # Reopened by an admin after the fix didn't hold, then resolved again and closed.
    ("Heater rattling on Floor 2", "Loud rattle from the heater by the east windows.",
     "hvac", "medium", _JOHN, ("HQ Tower", "Floor 2", None), 22 * _DAY,
     [("assign", 2, _SAM), ("start", 5), ("resolve", 8, "Tightened the fan housing."),
      ("reopen", 30, "The rattling came back the next morning"), ("resolve", 50, "Replaced the worn fan bearing."),
      ("note", 51, _SAM, "Should be quiet now; let me know if it comes back."), ("close", 120, None)]),
    # Blocked, then unblocked once the part arrived.
    ("Supply room door lock jammed", "The key turns but the bolt doesn't move.",
     "access_control", "medium", _JANE, ("HQ Tower", "Ground", None), 18 * _DAY,
     [("assign", 1, _LEE), ("start", 3), ("block", 4, "Waiting for the locksmith (booked for tomorrow)"),
      ("unblock", 28), ("resolve", 30, "Locksmith replaced the cylinder; new keys are at reception."),
      ("close", 80, None)]),
    # Closed by an admin while still in progress.
    ("Desks to dismantle in old project room", "Six desks and two large tables left after the team moved.",
     "furniture", "low", _MARIA, ("Riverside Annex", "Floor 1", None), 15 * _DAY,
     [("assign", 3, _TOM), ("start", 24), ("note", 25, _TOM, "Half done; the big tables need a second person."),
      ("close", 60, "Handed over to the office move project")]),
    # Escalated by the reporter, de-escalated by an admin with an explanation.
    ("Noisy ceiling vent above reception", "Constant whistling from the vent, hard to take calls.",
     "hvac", "low", _MARIA, ("HQ Tower", "Ground", "G-02"), 12 * _DAY,
     [("escalate", 1, "Reception can barely hear callers"), ("deescalate", 3),
      ("note", 3, _ADMIN, "Not urgent; scheduled with this week's HVAC maintenance visit."),
      ("assign", 4, _SAM), ("start", 48), ("resolve", 50, "Rebalanced the vent damper.")]),
    # Engineer unassigned mid-work (back to Open), then another engineer requests and gets it.
    ("Printer on Floor 1 keeps jamming", "Every second print job jams in tray 2.",
     "it_hardware", "medium", _JANE, ("HQ Tower", "Floor 1", None), 9 * _DAY,
     [("assign", 1, _DIEGO), ("start", 1.5), ("unassign", 2),
      ("request", 2.5, _PRIYA, "Printers are IT hardware, happy to take it"), ("assign", 3, _PRIYA),
      ("start", 4), ("resolve", 6, "Cleaned the rollers and replaced the pickup pad."), ("close", 30, None)]),
    # A request turned down with a note, then reassigned from one engineer to another mid-work.
    ("Water cooler leaking in the Annex", "Small puddle under the cooler on Floor 1 every morning.",
     "plumbing", "medium", _JOHN, ("Riverside Annex", "Floor 1", "R1-02"), 7 * _DAY,
     [("request", 1, _SAM, "I'm in the Annex today and can take a look"),
      ("reject", 2, _SAM, "Diego covers plumbing; thanks for offering"), ("assign", 2.5, _DIEGO),
      ("start", 4), ("assign", 20, _SAM), ("resolve", 22, "Replaced the tap seal.")]),
    # Edited by the reporter; one engineer withdraws a request, another is waiting for approval.
    ("Whiteboard hanging loose in the Lab", "The top bracket came off the wall.",
     "other", "low", _JOHN, ("Innovation Lab", "Ground", None), 30,
     [("edit", 0.5, {"description": "The top bracket came off the wall; it's leaning on LAB-04."}),
      ("request", 1, _PRIYA, "Can take it if nobody else does"), ("withdraw", 3, _PRIYA),
      ("request", 4, _TOM, "Wall fixtures are mine, I'll bring the drill")]),
    # Older than the default 30-day report window; reported by someone who has since left.
    ("Lights flickering in the parking garage", "Row C lights flicker on and off all day.",
     "electrical", "medium", _CHRIS, ("HQ Tower", "Basement", None), 45 * _DAY,
     [("assign", 2, _SAM), ("start", 3), ("resolve", 6, "Replaced two failing ballasts."), ("close", 48, None)]),
]

# status-changing steps -> new status
_STEP_STATUS = {"start": "in_progress", "block": "blocked", "unblock": "in_progress", "resolve": "resolved",
                "reopen": "in_progress", "close": "closed", "cancel": "closed"}


class _Timeline:
    """Replays one incident's steps, recording history the way the API does."""

    def __init__(self, session: Session, incident: Incident, users: dict[str, User]):
        self.session, self.incident, self.users = session, incident, users
        self.admin = users[_ADMIN]
        self.at = incident.created_at

    def apply(self, step: tuple) -> None:
        """Apply one (action, hours, *args) step at its time."""
        action, hours, *args = step
        self.at = self.incident.created_at + timedelta(hours=hours)
        if action in _STEP_STATUS:
            self._status(action, *args)
        else:
            getattr(self, "_" + action)(*args)
        self.incident.updated_at = self.at
        self.session.flush()

    # ---- helpers

    def _event(self, actor: User, kind: str, frm: Optional[str] = None, to: Optional[str] = None,
               comment: Optional[str] = None) -> None:
        self.session.add(IncidentEvent(incident_id=self.incident.id, actor_id=actor.id, type=kind,
                                       from_value=frm, to_value=to, comment=comment, created_at=self.at))

    def _acknowledge(self, actor: User) -> None:
        if actor.role != ROLE_EMPLOYEE and self.incident.acknowledged_at is None:
            self.incident.acknowledged_at = self.at

    def _pending(self, engineer: Optional[str] = None) -> list[AssignmentRequest]:
        query = select(AssignmentRequest).where(AssignmentRequest.incident_id == self.incident.id,
                                                AssignmentRequest.status == "pending")
        if engineer:
            query = query.where(AssignmentRequest.engineer_id == self.users[engineer].id)
        return list(self.session.scalars(query).unique())

    def _settle(self, decided_by: User, approved_id: Optional[int], reason: str) -> None:
        for request in self._pending():
            approved = request.engineer_id == approved_id
            request.status = "approved" if approved else "rejected"
            request.decided_by_id, request.decided_at = decided_by.id, self.at
            request.decision_note = None if approved else reason

    def _assignee(self) -> Optional[User]:
        return self.session.get(User, self.incident.assignee_id) if self.incident.assignee_id else None

    # ---- steps

    def _status(self, action: str, comment: Optional[str] = None) -> None:
        incident = self.incident
        actor = (self.session.get(User, incident.reporter_id) if action == "cancel"
                 else self.admin if action in ("close", "reopen") else self._assignee())
        new_status = _STEP_STATUS[action]
        if incident.status == STATUS_BLOCKED:
            incident.blocked_reason = None
        if action == "block":
            incident.blocked_reason = comment
        elif action == "resolve":
            incident.resolution, incident.resolved_at = comment, self.at
        elif action == "reopen":
            incident.resolution, incident.resolved_at = None, None
        elif new_status == "closed":
            incident.closed_at, incident.close_reason = self.at, comment
            self._settle(actor, None, "The incident was closed")
        self._acknowledge(actor)
        self._event(actor, "status_changed", incident.status, new_status, comment)
        incident.status = new_status

    def _assign(self, email: str) -> None:
        engineer, previous = self.users[email], self._assignee()
        self.incident.assignee_id, self.incident.assigned_at = engineer.id, self.at
        self._acknowledge(self.admin)
        self._event(self.admin, "assigned", previous.full_name if previous else None, engineer.full_name)
        self._settle(self.admin, engineer.id, f"The incident was assigned to {engineer.full_name}")

    def _unassign(self) -> None:
        self._event(self.admin, "unassigned", self._assignee().full_name)
        self.incident.assignee_id = None
        if self.incident.status in ("in_progress", "blocked"):
            self._event(self.admin, "status_changed", self.incident.status, "open", "Engineer unassigned")
            self.incident.status, self.incident.blocked_reason = "open", None

    def _escalate(self, reason: str) -> None:
        self.incident.is_escalated, self.incident.escalation_reason, self.incident.escalated_at = True, reason, self.at
        self._event(self.session.get(User, self.incident.reporter_id), "escalated", comment=reason)

    def _deescalate(self) -> None:
        self._event(self.admin, "deescalated", comment=self.incident.escalation_reason)
        self.incident.is_escalated, self.incident.escalation_reason = False, None

    def _priority(self, priority: str) -> None:
        self._event(self.admin, "priority_changed", self.incident.priority, priority)
        self.incident.priority = priority

    def _edit(self, changes: dict[str, Any]) -> None:
        self._event(self.session.get(User, self.incident.reporter_id), "updated",
                    comment="Changed " + ", ".join(sorted(changes)))
        for name, value in changes.items():
            setattr(self.incident, name, value)

    def _note(self, email: str, body: str) -> None:
        author = self.users[email]
        self.session.add(IncidentNote(incident_id=self.incident.id, author_id=author.id, body=body,
                                      created_at=self.at, updated_at=self.at))
        if author.id != self.incident.reporter_id:
            self._acknowledge(author)

    def _request(self, email: str, message: Optional[str]) -> None:
        engineer = self.users[email]
        self.session.add(AssignmentRequest(incident_id=self.incident.id, engineer_id=engineer.id,
                                           message=message, created_at=self.at))
        self._event(engineer, "assignment_requested", comment=message)

    def _reject(self, email: str, note: Optional[str]) -> None:
        for request in self._pending(email):
            request.status, request.decision_note = "rejected", note
            request.decided_by_id, request.decided_at = self.admin.id, self.at
        self._event(self.admin, "assignment_rejected", to=self.users[email].full_name, comment=note)

    def _withdraw(self, email: str) -> None:
        for request in self._pending(email):
            request.status, request.decided_at = "withdrawn", self.at


def _find_place(session: Session, building: str, floor: Optional[str], seat: Optional[str]) -> dict[str, Any]:
    b = session.scalar(select(Building).where(Building.name == building))
    f = session.scalar(select(Floor).where(Floor.building_id == b.id, Floor.name == floor)) if floor else None
    s = session.scalar(select(Seat).where(Seat.floor_id == f.id, Seat.code == seat)) if seat else None
    return {"building_id": b.id, "floor_id": f.id if f else None, "seat_id": s.id if s else None}


def _seed_incidents(session: Session) -> int:
    if session.scalar(select(func.count()).select_from(Incident)):
        return 0
    users = {u.email: u for u in session.scalars(select(User).where(User.email.in_(
        [email for email, *_ in USERS]))).unique()}
    now = datetime.now(timezone.utc)
    for title, description, category, priority, reporter, place, hours_ago, steps in INCIDENTS:
        reported_at = now - timedelta(hours=hours_ago)
        incident = Incident(
            title=title, description=description, category=category, priority=priority, status="open",
            reporter_id=users[reporter].id, created_at=reported_at, updated_at=reported_at,
            **_find_place(session, *place),
        )
        session.add(incident)
        session.flush()
        session.add(IncidentEvent(incident_id=incident.id, actor_id=incident.reporter_id, type="created",
                                  to_value="open", created_at=reported_at))
        timeline = _Timeline(session, incident, users)
        for step in steps:
            timeline.apply(step)
    return len(INCIDENTS)


def run(session: Session) -> None:
    """Add any missing demo users, buildings, floors and seats, and demo incidents if there are none."""
    password_hash = security.hash_password(DEMO_PASSWORD)
    users = _seed_users(session, password_hash)
    places = _seed_facilities(session)
    session.flush()
    incidents = _seed_incidents(session)
    if users or places or incidents:
        logger.info("Demo data: added %s users, %s buildings/floors/seats and %s incidents (password: %s)",
                    users, places, incidents, DEMO_PASSWORD)


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
    print(f"Done. Sign in as {_ADMIN} (or any demo user) with password {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
