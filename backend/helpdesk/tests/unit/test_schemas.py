"""Unit tests for shared Pydantic types and error conversion."""

import pytest

from app.auth.schemas import LoginRequest, RegisterRequest
from app.core.errors import ValidationError
from app.core.schemas import parse
from app.users.schemas import AdminUserUpdate, EngineerSelfUpdate, UserListQuery


def _fields(model, data):
    with pytest.raises(ValidationError) as exc:
        parse(model, data)
    return exc.value.fields


def test_register_normalizes_email_and_name():
    body = parse(RegisterRequest, {"email": "  First.Last+x@ACME.INC ", "full_name": "  Jo  ",
                                   "password": "Password123"})
    assert body.email == "first.last+x@acme.inc"
    assert body.full_name == "Jo"


@pytest.mark.parametrize("email", ["a@acme.com", "a@sub.acme.inc", "a b@acme.inc", "nope", ""])
def test_rejects_non_acme_emails(email):
    assert "email" in _fields(RegisterRequest, {"email": email, "full_name": "J", "password": "Password123"})


def test_passwords_are_not_stripped():
    body = parse(RegisterRequest, {"email": "a@acme.inc", "full_name": "A", "password": " Password123 "})
    assert body.password == " Password123 "


def test_error_messages_are_friendly():
    fields = _fields(RegisterRequest, {"extra": 1, "password": "short"})
    assert fields["email"] == "This field is required"
    assert fields["extra"] == "Unknown field"
    assert fields["password"].startswith("Password must be at least")


def test_login_lowercases_without_domain_check():
    assert parse(LoginRequest, {"email": " X@Other.com ", "password": "p"}).email == "x@other.com"


def test_patch_tracks_only_sent_fields():
    body = parse(AdminUserUpdate, {"full_name": "New"})
    assert body.model_dump(exclude_unset=True) == {"full_name": "New"}


def test_patch_rejects_null_for_non_nullable_fields():
    assert _fields(AdminUserUpdate, {"full_name": None, "role": None}) == {
        "full_name": "Cannot be null", "role": "Cannot be null",
    }


def test_profile_phone_can_be_cleared():
    for phone in (None, "", "   "):
        body = parse(EngineerSelfUpdate, {"engineer_profile": {"phone": phone}})
        assert body.model_dump(exclude_unset=True) == {"engineer_profile": {"phone": None}}


def test_nested_list_errors_map_to_the_field():
    fields = _fields(AdminUserUpdate, {"engineer_profile": {"specialties": ["hvac", "magic"]}})
    assert list(fields) == ["engineer_profile.specialties"]


def test_specialties_are_deduplicated():
    body = parse(AdminUserUpdate, {"engineer_profile": {"specialties": ["hvac", "network", "hvac"]}})
    assert body.engineer_profile.specialties == ["hvac", "network"]


def test_list_query_coerces_strings():
    query = parse(UserListQuery, {"page": "2", "is_active": "false", "role": "engineer", "other": "x"})
    assert (query.page, query.is_active, query.role) == (2, False, "engineer")


@pytest.mark.parametrize("data", [{"page": "0"}, {"page_size": "101"}, {"is_active": "maybe"}, {"role": "boss"}])
def test_list_query_rejects_bad_values(data):
    with pytest.raises(ValidationError):
        parse(UserListQuery, data)
