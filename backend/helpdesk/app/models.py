"""
Imports every ORM model so Base.metadata knows all tables before create_all().
Add new modules' models here.
"""

from app.facilities.models import Building, Floor, Seat
from app.users.models import EngineerProfile, User

__all__ = ["Building", "EngineerProfile", "Floor", "Seat", "User"]
