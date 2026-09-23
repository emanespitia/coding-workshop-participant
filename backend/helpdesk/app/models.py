"""
Imports every ORM model so Base.metadata knows all tables before create_all().
Add new modules' models here.
"""

from app.users.models import EngineerProfile, User

__all__ = ["EngineerProfile", "User"]
