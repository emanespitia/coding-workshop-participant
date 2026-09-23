"""
Translation between Lambda Function URL events and a small Request/Response model.
"""

import base64
import json
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.core.config import API_PREFIX
from app.core.errors import ApiError, BadRequestError

_MISSING = object()


def _json_default(value: Any) -> Any:
    """Serialize types the stdlib json encoder does not handle."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def to_json(data: Any) -> str:
    """Encode data as JSON, supporting datetimes."""
    return json.dumps(data, default=_json_default)


@dataclass
class Request:
    """An incoming API request, normalized from the Lambda event."""

    method: str
    path: str
    headers: dict = field(default_factory=dict)
    query: dict = field(default_factory=dict)
    raw_body: Optional[str] = None
    path_params: dict = field(default_factory=dict)
    user: Any = None  # the authenticated app.users.models.User
    db: Any = None  # SQLAlchemy Session with an open transaction
    _body: Any = field(default=_MISSING, repr=False)

    @classmethod
    def from_event(cls, event: dict) -> "Request":
        """Build a Request from a Lambda Function URL (payload v2) event."""
        http = (event.get("requestContext") or {}).get("http") or {}
        method = (http.get("method") or event.get("httpMethod") or "GET").upper()
        path = event.get("rawPath") or http.get("path") or event.get("path") or "/"
        if path == API_PREFIX or path.startswith(API_PREFIX + "/"):
            path = path[len(API_PREFIX):]
        path = "/" + path.strip("/")

        raw_body = event.get("body")
        if raw_body and event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode("utf-8")

        headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        return cls(
            method=method,
            path=path,
            headers=headers,
            query=dict(event.get("queryStringParameters") or {}),
            raw_body=raw_body,
        )

    @property
    def body(self) -> dict:
        """The request body parsed as a JSON object (empty dict when absent)."""
        if self._body is _MISSING:
            if not self.raw_body:
                self._body = {}
            else:
                try:
                    self._body = json.loads(self.raw_body)
                except (ValueError, TypeError) as exc:
                    raise BadRequestError("Request body is not valid JSON", code="INVALID_JSON") from exc
            if not isinstance(self._body, dict):
                raise BadRequestError("Request body must be a JSON object", code="INVALID_JSON")
        return self._body


@dataclass
class Response:
    """An outgoing API response."""

    status: int = 200
    body: Any = None

    def to_lambda(self) -> dict:
        """Convert to the Lambda Function URL response format."""
        response = {
            "statusCode": self.status,
            "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        }
        if self.body is None:
            response["body"] = ""
        elif isinstance(self.body, BaseModel):
            response["body"] = self.body.model_dump_json()
        else:
            response["body"] = to_json(self.body)
        return response


def ok(body: Any) -> Response:
    """200 OK."""
    return Response(200, body)


def created(body: Any) -> Response:
    """201 Created."""
    return Response(201, body)


def no_content() -> Response:
    """204 No Content."""
    return Response(204, None)


def error_response(error: ApiError) -> Response:
    """Build the response for an ApiError."""
    return Response(error.status, error.to_dict())
