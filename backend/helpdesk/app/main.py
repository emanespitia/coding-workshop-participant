"""
Request pipeline: parse event -> resolve route -> authenticate -> authorize ->
run handler inside a database transaction -> serialize response.
"""

import logging

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.auth.routes import router as auth_router
from app.core import db
from app.core.auth import authenticate, require_role
from app.core.errors import ApiError, ForbiddenError, ServiceUnavailableError
from app.core.http import Request, Response, error_response, ok
from app.core.router import Router
from app.users.routes import router as users_router

logger = logging.getLogger(__name__)

router = Router()
router.include(auth_router)
router.include(users_router)


@router.route("GET", "/health", public=True)
def health(req: Request) -> Response:
    """Liveness check that also verifies database connectivity."""
    req.db.execute(text("SELECT 1"))
    return ok({"status": "ok"})


def dispatch(req: Request) -> Response:
    """Route and execute a request, converting errors into API responses."""
    if req.method == "OPTIONS":
        return Response(204, None)
    try:
        route, req.path_params = router.resolve(req.method, req.path)
        with db.session_scope() as session:
            req.db = session
            if not route.public:
                req.user = authenticate(session, req)
                if req.user.must_change_password and not route.allow_password_change_pending:
                    raise ForbiddenError("You must change your password before continuing",
                                         code="PASSWORD_CHANGE_REQUIRED")
                if route.roles:
                    require_role(req.user, *route.roles)
            return route.handler(req)
    except ApiError as exc:
        return error_response(exc)
    except OperationalError:
        logger.exception("Database connection error on %s %s", req.method, req.path)
        db.reset()
        return error_response(ServiceUnavailableError("The service is temporarily unavailable"))
    except Exception:  # pylint: disable=broad-except
        logger.exception("Unhandled error on %s %s", req.method, req.path)
        return error_response(ApiError("An unexpected error occurred"))


def handle(event: dict) -> dict:
    """Entry point used by the Lambda handler."""
    try:
        req = Request.from_event(event or {})
    except Exception:  # pylint: disable=broad-except
        logger.exception("Could not parse event")
        return error_response(ApiError("Malformed request")).to_lambda()
    response = dispatch(req)
    logger.info("%s %s -> %s", req.method, req.path, response.status)
    return response.to_lambda()
