"""
Integration test fixtures: a real PostgreSQL database, reset before every test,
and helpers to call the API (in-process via FastAPI's TestClient) and create users.
"""

import itertools
import json
import os
from dataclasses import dataclass
from typing import Any, Optional

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from app.core import config, db, security
from app.core.constants import ROLE_ENGINEER
from app.core.orm import Base
from app.main import app
from app.users import repository as users_repo
from app.users.models import EngineerProfile

DEFAULT_PASSWORD = "Password123"
_DEFAULT_HASH = security.hash_password(DEFAULT_PASSWORD)
_counter = itertools.count(1)


@pytest.fixture(scope="session", autouse=True)
def database():
    """Create the test database (if needed) and start from an empty schema."""
    name = os.environ["POSTGRES_NAME"]
    admin_engine = create_engine(config.postgres_url("postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": name})
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{name}"'))
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL is not available: {exc}", allow_module_level=True)
    finally:
        admin_engine.dispose()

    db.reset()
    db._initialized = False  # pylint: disable=protected-access
    Base.metadata.drop_all(db.get_engine())
    yield
    db.reset()


@pytest.fixture(autouse=True)
def clean_tables(database):
    """Empty all tables and recreate the bootstrap admin before each test."""
    with db.session_scope() as session:
        tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
        session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        db.ensure_bootstrap_admin(session)
    yield


@dataclass
class ApiResult:
    """Status code and decoded JSON body of a handler call."""

    status: int
    body: Any
    headers: Any = None

    @property
    def error_code(self) -> Optional[str]:
        """The error code, if the response is an error."""
        return (self.body or {}).get("error", {}).get("code")


_client = TestClient(app, raise_server_exceptions=False)


def call_api(method: str, path: str, body: Any = None, token: Optional[str] = None,
             query: Optional[dict] = None, raw_body: Optional[str] = None,
             headers: Optional[dict] = None) -> ApiResult:
    """Call the FastAPI app in-process and decode the JSON response."""
    headers = {"content-type": "application/json", **(headers or {})}
    if token:
        headers["authorization"] = f"Bearer {token}"
    content = raw_body if raw_body is not None else (json.dumps(body) if body is not None else None)
    response = _client.request(method, path, headers=headers, params=query, content=content)
    is_json = response.headers.get("content-type", "").startswith("application/json")
    body = response.json() if is_json and response.content else (response.text or None)
    return ApiResult(response.status_code, body, response.headers)


@pytest.fixture
def api():
    """The call_api helper."""
    return call_api


@pytest.fixture
def make_user():
    """
    Create a user directly in the database and return it with an access token.

    Returns a dict with id, email, full_name, role, token and password.
    """
    def _make(role: str = "employee", *, email: Optional[str] = None, full_name: Optional[str] = None,
              is_active: bool = True, must_change_password: bool = False,
              profile: Optional[dict] = None) -> dict:
        n = next(_counter)
        with db.session_scope() as session:
            user = users_repo.create_user(
                session,
                email=email or f"{role}{n}@acme.inc",
                full_name=full_name or f"{role.title()} {n}",
                password_hash=_DEFAULT_HASH,
                role=role,
                must_change_password=must_change_password,
            )
            user.is_active = is_active
            if role == ROLE_ENGINEER:
                user.engineer_profile = EngineerProfile(**{"specialties": ["other"], **(profile or {})})
            session.flush()
            return {
                "id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role,
                "token": security.issue_tokens(user)["access_token"], "password": DEFAULT_PASSWORD,
            }

    return _make


@pytest.fixture
def admin(make_user):
    """An active admin (in addition to the bootstrap admin)."""
    return make_user("admin")


@pytest.fixture
def employee(make_user):
    """An active employee."""
    return make_user("employee")


@pytest.fixture
def engineer(make_user):
    """An active engineer."""
    return make_user("engineer", profile={"specialties": ["hvac"]})
