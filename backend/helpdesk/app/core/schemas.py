"""
Pydantic building blocks shared by every module: base models, reusable field
types, and conversion of Pydantic errors into the API error format.
"""

from typing import Annotated, Any, ClassVar, TypeVar

import pydantic
from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core import security
from app.core.errors import ValidationError

EMAIL_DOMAIN = "acme.inc"

_FRIENDLY_MESSAGES = {
    "missing": "This field is required",
    "extra_forbidden": "Unknown field",
}

M = TypeVar("M", bound=BaseModel)


class StrictModel(BaseModel):
    """Request body model: unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")


class PatchModel(StrictModel):
    """
    Partial-update model. Every field is optional, but a field that *is* sent
    may not be null unless listed in `nullable_fields`. Use
    `model_dump(exclude_unset=True)` to get only the fields the client sent.
    """

    nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @field_validator("*", mode="before")
    @classmethod
    def _reject_null(cls, value: Any, info: pydantic.ValidationInfo) -> Any:
        if value is None and info.field_name not in cls.nullable_fields:
            raise ValueError("Cannot be null")
        return value


class QueryModel(BaseModel):
    """
    Query-string model. Unknown parameters are ignored and empty values
    (e.g. `?role=`) are treated as not provided.
    """

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _drop_empty(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if v not in ("", None)}
        return data


def _strip(value: Any) -> Any:
    return value.strip() if isinstance(value, str) else value


def _acme_only(email: str) -> str:
    email = email.lower()
    if not email.endswith("@" + EMAIL_DOMAIN):
        raise ValueError(f"Must be an @{EMAIL_DOMAIN} email address")
    return email


def _password_policy(password: str) -> str:
    problem = security.password_policy_error(password)
    if problem:
        raise ValueError(problem)
    return password


def _dedupe(values: list) -> list:
    return list(dict.fromkeys(values))


AcmeEmail = Annotated[EmailStr, BeforeValidator(_strip), AfterValidator(_acme_only)]
"""A valid email address on the acme.inc domain, lower-cased."""

NewPassword = Annotated[str, AfterValidator(_password_policy)]
"""A password that satisfies the password policy (never stripped)."""

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
"""A trimmed, non-blank display name."""


def UniqueList(item_type: Any) -> Any:  # pylint: disable=invalid-name
    """A list type whose duplicate items are removed (order preserved)."""
    return Annotated[list[item_type], AfterValidator(_dedupe)]


def _message(error: dict) -> str:
    if error["type"] in _FRIENDLY_MESSAGES:
        return _FRIENDLY_MESSAGES[error["type"]]
    return error["msg"].removeprefix("Value error, ")


def _field_path(loc: tuple) -> str:
    # List indexes are dropped so errors map onto form fields ("tags", not "tags.2").
    return ".".join(str(part) for part in loc if not isinstance(part, int)) or "body"


def error_fields(errors: list[dict], *, strip_location: bool = False) -> dict[str, str]:
    """
    Convert Pydantic/FastAPI errors into {"field.path": "message"}.

    Args:
        errors: The `.errors()` list of a validation error.
        strip_location: Drop FastAPI's leading "body"/"query"/"path" segment.
    """
    fields: dict[str, str] = {}
    for error in errors:
        loc = tuple(error["loc"])
        if strip_location and loc and loc[0] in ("body", "query", "path", "header"):
            loc = loc[1:]
        fields.setdefault(_field_path(loc), _message(error))
    return fields


def parse(model: type[M], data: Any) -> M:
    """Validate data against a model, raising the API's 400 ValidationError on failure."""
    try:
        return model.model_validate(data)
    except pydantic.ValidationError as exc:
        raise ValidationError(error_fields(exc.errors())) from exc
