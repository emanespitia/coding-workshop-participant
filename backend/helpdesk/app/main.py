"""
FastAPI application: routers, error handling and the /api/helpdesk path prefix.

Run locally:   uvicorn app.main:app --reload   ->  http://localhost:8000/docs
               (settings come from .env.local; see README)
On AWS Lambda: function.py wraps this app with Mangum.
"""

import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Receive, Scope, Send

from app.auth.routes import router as auth_router
from app.core import config, db
from app.core.config import API_PREFIX
from app.core.deps import DbSession
from app.core.errors import (
    ApiError,
    BadRequestError,
    MethodNotAllowedError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
)
from app.core.schemas import error_fields
from app.facilities.routes import router as facilities_router
from app.users.routes import router as users_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """
    Local server startup: create tables and (if SEED_DEMO_DATA=true) demo data
    right away instead of on the first request. Not used on Lambda (Mangum
    runs with lifespan="off"), where this happens lazily on the first request.
    """
    db.init_schema()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="ACME Facility Helpdesk API",
    version="1.0.0",
    description=(
        "Sign in with **POST /auth/login**, copy `tokens.access_token`, click **Authorize** "
        "and paste it. Errors always look like `{\"error\": {\"code\", \"message\", \"fields\"}}`."
    ),
    redoc_url=None,
)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(facilities_router)


@app.get("/health", tags=["system"])
def health(session: DbSession) -> dict:
    """Liveness check that also verifies database connectivity."""
    session.execute(text("SELECT 1"))
    return {"status": "ok"}


# ---- Error handling: everything uses the {"error": {...}} envelope ------------

def _error(error: ApiError) -> JSONResponse:
    return JSONResponse(error.to_dict(), status_code=error.status)


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    """Errors raised deliberately by our code."""
    return _error(exc)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """FastAPI's 422 becomes our 400 VALIDATION_ERROR (or INVALID_JSON for unusable bodies)."""
    errors = exc.errors()
    for error in errors:
        if error["type"] == "json_invalid":
            return _error(BadRequestError("Request body is not valid JSON", code="INVALID_JSON"))
        if tuple(error["loc"]) == ("body",):
            return _error(BadRequestError("Request body must be a JSON object", code="INVALID_JSON"))
    return _error(ValidationError(error_fields(errors, strip_location=True)))


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Unknown routes and wrong methods."""
    if exc.status_code == 404:
        return _error(NotFoundError(f"No route for {request.method} {request.url.path}"))
    if exc.status_code == 405:
        return _error(MethodNotAllowedError(f"Method {request.method} not allowed"))
    error = ApiError(str(exc.detail), code="HTTP_ERROR")
    error.status = exc.status_code
    return _error(error)


@app.exception_handler(OperationalError)
async def database_error_handler(request: Request, _: OperationalError) -> JSONResponse:
    """Database unreachable: drop pooled connections and return 503."""
    logger.exception("Database error on %s %s", request.method, request.url.path)
    db.reset()
    return _error(ServiceUnavailableError("The service is temporarily unavailable"))


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, _: Exception) -> JSONResponse:
    """Anything else: log it, never leak details to the client."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return _error(ApiError("An unexpected error occurred"))


# ---- Middleware -----------------------------------------------------------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One log line per request (visible in CloudWatch)."""
    started = time.perf_counter()
    response = await call_next(request)
    logger.info("%s %s -> %s (%.0f ms)", request.method, request.url.path, response.status_code,
                (time.perf_counter() - started) * 1000)
    return response


if not config.running_on_lambda():
    # Local development only: on AWS the Lambda Function URL adds CORS headers itself.
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class PrefixMiddleware:
    """
    Accept requests with or without the /api/helpdesk prefix.

    Through CloudFront paths arrive as /api/helpdesk/...; locally they don't.
    Setting root_path makes routing ignore the prefix and makes /docs load
    /api/helpdesk/openapi.json.
    """

    def __init__(self, asgi_app: ASGIApp) -> None:
        self.app = asgi_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] == "http" and (path == API_PREFIX or path.startswith(API_PREFIX + "/")):
            scope = {**scope, "root_path": API_PREFIX}
        await self.app(scope, receive, send)


app.add_middleware(PrefixMiddleware)
