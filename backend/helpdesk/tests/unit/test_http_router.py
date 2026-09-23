"""Unit tests for event parsing, responses and routing."""

import base64
import json

import pytest

from app.core.errors import BadRequestError, MethodNotAllowedError, NotFoundError
from app.core.http import Request, Response
from app.core.router import Router


def _event(path, method="GET", body=None, b64=False, headers=None):
    raw = json.dumps(body) if body is not None else None
    if raw and b64:
        raw = base64.b64encode(raw.encode()).decode()
    return {"rawPath": path, "requestContext": {"http": {"method": method}},
            "body": raw, "isBase64Encoded": b64, "headers": headers or {}}


@pytest.mark.parametrize("raw,expected", [
    ("/api/helpdesk/users/3", "/users/3"),
    ("/api/helpdesk", "/"),
    ("/users/", "/users"),
    ("/api/helpdesker", "/api/helpdesker"),
])
def test_prefix_stripping(raw, expected):
    assert Request.from_event(_event(raw)).path == expected


def test_headers_lowercased_and_base64_body():
    req = Request.from_event(_event("/x", "post", {"a": 1}, b64=True, headers={"Authorization": "Bearer t"}))
    assert req.method == "POST"
    assert req.headers["authorization"] == "Bearer t"
    assert req.body == {"a": 1}


def test_invalid_body():
    req = Request.from_event({"rawPath": "/x", "body": "{"})
    with pytest.raises(BadRequestError):
        _ = req.body


def test_response_serializes_datetimes():
    from datetime import datetime, timezone
    out = Response(200, {"at": datetime(2026, 1, 2, tzinfo=timezone.utc)}).to_lambda()
    assert json.loads(out["body"]) == {"at": "2026-01-02T00:00:00+00:00"}
    assert Response(204).to_lambda()["body"] == ""


def test_router_matches_params_and_methods():
    router = Router()

    @router.route("GET", "/items/{id}/notes/{note_id}")
    def handler(req):
        return req

    route, params = router.resolve("GET", "/items/4/notes/9")
    assert route.handler is handler
    assert params == {"id": 4, "note_id": 9}
    with pytest.raises(MethodNotAllowedError):
        router.resolve("POST", "/items/4/notes/9")
    with pytest.raises(NotFoundError):
        router.resolve("GET", "/items/abc/notes/9")
