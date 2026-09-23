"""
Request and response models for authentication.

Registration never accepts a role: self-registered accounts are always employees.
"""

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.core.schemas import AcmeEmail, Name, NewPassword, StrictModel
from app.core.security import PASSWORD_MAX_LENGTH
from app.users.schemas import UserPublic

AnyPassword = Annotated[str, Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)]


class RegisterRequest(StrictModel):
    """POST /auth/register."""

    email: AcmeEmail
    full_name: Name
    password: NewPassword


class LoginRequest(StrictModel):
    """POST /auth/login. The email is not domain-checked so the error stays generic."""

    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=254)]
    password: AnyPassword


class RefreshRequest(StrictModel):
    """POST /auth/refresh."""

    refresh_token: Annotated[str, Field(min_length=1, max_length=4096)]


class ChangePasswordRequest(StrictModel):
    """PUT /auth/password."""

    current_password: AnyPassword
    new_password: NewPassword


class TokenPair(BaseModel):
    """Access and refresh tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class SessionResponse(BaseModel):
    """Signed-in user plus tokens."""

    user: UserPublic
    tokens: TokenPair
