"""
Imports every ORM model so Base.metadata knows all tables before create_all().
Add new modules' models here.
"""

from app.facilities.models import Building, Floor, Seat
from app.incidents.models import AssignmentRequest, Incident, IncidentEvent, IncidentNote
from app.users.models import EngineerProfile, User

__all__ = [
    "AssignmentRequest", "Building", "EngineerProfile", "Floor", "Incident", "IncidentEvent",
    "IncidentNote", "Seat", "User",
]
