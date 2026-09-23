"""
Minimal path router with per-route authentication and role requirements.
"""

import re
from dataclasses import dataclass
from typing import Callable, Optional

from app.core.errors import MethodNotAllowedError, NotFoundError

_PARAM = re.compile(r"\{(\w+)\}")


@dataclass
class Route:
    """A registered route."""

    method: str
    pattern: re.Pattern
    handler: Callable
    public: bool
    roles: Optional[tuple]
    allow_password_change_pending: bool


class Router:
    """Collects routes and resolves (method, path) to a Route."""

    def __init__(self) -> None:
        self.routes: list[Route] = []

    def route(
        self,
        method: str,
        path: str,
        *,
        public: bool = False,
        roles: Optional[tuple] = None,
        allow_password_change_pending: bool = False,
    ) -> Callable:
        """
        Register a handler.

        Args:
            method: HTTP method.
            path: Path template; "{name}" segments match positive integers and are
                passed to the handler as int path params.
            public: Skip authentication entirely.
            roles: If set, only users with one of these roles may call the route.
            allow_password_change_pending: Allow users who must change their
                password to call this route.
        """
        regex = "^" + _PARAM.sub(r"(?P<\1>[0-9]+)", path.rstrip("/") or "/") + "$"

        def decorator(handler: Callable) -> Callable:
            self.routes.append(Route(
                method.upper(), re.compile(regex), handler, public, roles, allow_password_change_pending,
            ))
            return handler

        return decorator

    def include(self, other: "Router") -> None:
        """Merge routes from another router."""
        self.routes.extend(other.routes)

    def resolve(self, method: str, path: str) -> tuple[Route, dict]:
        """Find the route for a request, raising 404/405 when none matches."""
        path_matched = False
        for route in self.routes:
            match = route.pattern.match(path)
            if not match:
                continue
            path_matched = True
            if route.method == method:
                return route, {k: int(v) for k, v in match.groupdict().items()}
        if path_matched:
            raise MethodNotAllowedError(f"Method {method} not allowed for {path}")
        raise NotFoundError(f"No route for {method} {path}")
