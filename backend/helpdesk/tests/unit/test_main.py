"""Unit tests for the request pipeline's error handling (no database needed)."""

from sqlalchemy.exc import OperationalError

from app import main
from app.core import db


def _event(path, method="GET"):
    return {"rawPath": path, "requestContext": {"http": {"method": method}}}


def test_database_outage_returns_503(monkeypatch):
    def boom():
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(db, "session_scope", boom)
    out = main.handle(_event("/health"))
    assert out["statusCode"] == 503
    assert '"SERVICE_UNAVAILABLE"' in out["body"]


def test_unexpected_error_returns_generic_500(monkeypatch):
    def boom():
        raise RuntimeError("secret internals")

    monkeypatch.setattr(db, "session_scope", boom)
    out = main.handle(_event("/health"))
    assert out["statusCode"] == 500
    assert "secret internals" not in out["body"]


def test_unparseable_event_returns_500():
    out = main.handle({"rawPath": 123})
    assert out["statusCode"] == 500


def test_options_short_circuits():
    assert main.handle(_event("/anything", "OPTIONS"))["statusCode"] == 204
