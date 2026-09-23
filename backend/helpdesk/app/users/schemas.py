"""
Request and response models for user management.

Separate models per caller encode who may change what: admins use
AdminUserCreate/AdminUserUpdate, everyone else SelfUserUpdate.
"""

from datetime import datetime
from typing import Annotated, ClassVar, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.core.constants import Availability, Category, Role
from app.core.schemas import AcmeEmail, Name, PatchModel, StrictModel, UniqueList

NO_SPECIALTY_MESSAGE = "Choose at least one specialty for an engineer"


def _at_least_one(values: list) -> list:
    if not values:
        raise ValueError(NO_SPECIALTY_MESSAGE)
    return values


Specialties = Annotated[UniqueList(Category), AfterValidator(_at_least_one)]
"""One or more issue categories an engineer can work on (duplicates removed)."""

Phone = Annotated[
    Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)]],
    AfterValidator(lambda value: value or None),  # "" clears the phone number
]


# ---- Engineer profile -------------------------------------------------------

class AdminProfileInput(PatchModel):
    """Engineer profile fields an admin may set."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset({"phone"})

    specialties: Specialties = None
    availability: Availability = None
    phone: Phone = None


class SelfProfileInput(PatchModel):
    """Engineer profile fields engineers may set on their own profile."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset({"phone"})

    availability: Availability = None
    phone: Phone = None


# ---- Requests ---------------------------------------------------------------

class AdminUserCreate(StrictModel):
    """POST /users (admin). A temporary password is generated server-side."""

    email: AcmeEmail
    full_name: Name
    role: Role
    engineer_profile: Optional[AdminProfileInput] = None


class AdminUserUpdate(PatchModel):
    """PATCH /users/{id} by an admin."""

    email: AcmeEmail = None
    full_name: Name = None
    role: Role = None
    is_active: bool = None
    engineer_profile: AdminProfileInput = None


class SelfUserUpdate(PatchModel):
    """PATCH /users/{id} on your own account (non-admin)."""

    full_name: Name = None


class EngineerSelfUpdate(SelfUserUpdate):
    """PATCH /users/{id} on your own account as an engineer."""

    engineer_profile: SelfProfileInput = None


class UserListQuery(BaseModel):
    """Query string for GET /users. Values arrive as strings and are coerced."""

    q: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None
    page: int = Field(1, ge=1, le=10_000)
    page_size: int = Field(25, ge=1, le=100)

    model_config = ConfigDict(extra="ignore")


# ---- Responses --------------------------------------------------------------

class EngineerProfile(BaseModel):
    """Engineer-specific details."""

    model_config = ConfigDict(from_attributes=True)

    specialties: list[Category]
    availability: Availability
    phone: Optional[str] = None


class UserPublic(BaseModel):
    """A user as returned by the API. Never includes the password hash or token version."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    must_change_password: bool
    engineer_profile: Optional[EngineerProfile] = None
    last_login_at: Optional[datetime] = None
    password_changed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class UserResponse(BaseModel):
    """Single-user envelope."""

    user: UserPublic


class UserListResponse(BaseModel):
    """Paginated list of users."""

    items: list[UserPublic]
    total: int
    page: int
    page_size: int


class CreatedUserResponse(BaseModel):
    """Result of an admin creating an account."""

    user: UserPublic
    temporary_password: str


class TemporaryPasswordResponse(BaseModel):
    """Result of an admin password reset."""

    temporary_password: str
