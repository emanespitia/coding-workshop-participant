"""Unit tests for the app's error handling and the Lambda adapter (no database needed)."""

import json

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

import function
from app.core.deps import get_db
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def _override_db(exc: Exception):
    def broken():
        raise exc
        # makes this a generator dependency
        yield  # pragma: no cover  # pylint: disable=unreachable
    app.dependency_overrides[get_db] = broken


def test_database_outage_returns_503():
    _override_db(OperationalError("SELECT 1", {}, Exception("connection refused")))
    try:
        res = client.get("/health")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


def test_unexpected_error_returns_generic_500():
    _override_db(RuntimeError("secret internals"))
    try:
        res = client.get("/health")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 500
    assert "secret internals" not in res.text
    assert res.json()["error"]["code"] == "INTERNAL_ERROR"


def test_unknown_route_and_wrong_method_use_error_envelope():
    assert client.get("/nope").json()["error"]["code"] == "NOT_FOUND"
    res = client.delete("/auth/login")
    assert res.status_code == 405
    assert res.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_docs_and_openapi_with_and_without_prefix():
    assert client.get("/docs").status_code == 200
    page = client.get("/api/helpdesk/docs")
    assert page.status_code == 200
    assert "/api/helpdesk/openapi.json" in page.text  # docs page loads the prefixed spec
    spec = client.get("/api/helpdesk/openapi.json").json()
    assert "/users/{user_id}" in spec["paths"]
    assert "password_hash" not in json.dumps(spec["components"]["schemas"]["UserPublic"])


def _function_url_event(path: str, method: str = "GET") -> dict:
    """A minimal Lambda Function URL (payload v2.0) event, as CloudFront forwards it."""
    return {
        "version": "2.0",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {"host": "abc.lambda-url.us-east-2.on.aws", "accept": "application/json"},
        "requestContext": {
            "accountId": "anonymous",
            "domainName": "abc.lambda-url.us-east-2.on.aws",
            "http": {"method": method, "path": path, "protocol": "HTTP/1.1",
                     "sourceIp": "127.0.0.1", "userAgent": "test"},
            "requestId": "req-1",
            "routeKey": "$default",
            "stage": "$default",
            "timeEpoch": 0,
        },
        "isBase64Encoded": False,
    }


def test_lambda_handler_serves_prefixed_paths():
    out = function.handler(_function_url_event("/api/helpdesk/openapi.json"), None)
    assert out["statusCode"] == 200
    assert json.loads(out["body"])["info"]["title"] == "ACME Facility Helpdesk API"

    out = function.handler(_function_url_event("/api/helpdesk/nope"), None)
    assert out["statusCode"] == 404
    assert json.loads(out["body"])["error"]["code"] == "NOT_FOUND"
