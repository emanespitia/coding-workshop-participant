"""
API error types. Raising one of these anywhere in a handler produces a
consistent JSON error response: {"error": {"code", "message", "fields"?}}.
"""

from typing import Optional


class ApiError(Exception):
    """Base class for errors that map directly to an HTTP response."""

    status = 500
    code = "INTERNAL_ERROR"

    def __init__(self, message: str, code: Optional[str] = None, fields: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.fields = fields

    def to_dict(self) -> dict:
        """Serialize the error into the API error envelope."""
        error = {"code": self.code, "message": self.message}
        if self.fields:
            error["fields"] = self.fields
        return {"error": error}


class BadRequestError(ApiError):
    """Malformed request (e.g. invalid JSON)."""

    status = 400
    code = "BAD_REQUEST"


class ValidationError(ApiError):
    """One or more fields failed validation."""

    status = 400
    code = "VALIDATION_ERROR"

    def __init__(self, fields: dict, message: str = "Validation failed"):
        super().__init__(message, fields=fields)


class UnauthorizedError(ApiError):
    """Missing, invalid or expired credentials."""

    status = 401
    code = "UNAUTHORIZED"


class ForbiddenError(ApiError):
    """Authenticated, but not allowed to perform this action."""

    status = 403
    code = "FORBIDDEN"


class NotFoundError(ApiError):
    """Resource or route does not exist (or is not visible to the caller)."""

    status = 404
    code = "NOT_FOUND"


class MethodNotAllowedError(ApiError):
    """Route exists but not for this HTTP method."""

    status = 405
    code = "METHOD_NOT_ALLOWED"


class ConflictError(ApiError):
    """Request conflicts with current state (duplicates, business rules)."""

    status = 409
    code = "CONFLICT"


class ServiceUnavailableError(ApiError):
    """A dependency (e.g. the database) is unreachable."""

    status = 503
    code = "SERVICE_UNAVAILABLE"
