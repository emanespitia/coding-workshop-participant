"""
One-off operator tasks, run by invoking the Lambda directly (not over HTTP):

    aws lambda invoke --function-name coding-workshop-helpdesk-<app id> \\
        --cli-binary-format raw-in-base64-out \\
        --payload '{"task": "seed_demo_data"}' out.json

Only callers with AWS permission to invoke the function can run these. Requests through
CloudFront or the Function URL always arrive as HTTP events and go to the API instead.
"""

import logging
from typing import Any, Callable

from app import seed
from app.core import db, security

logger = logging.getLogger(__name__)


def seed_demo_data(event: dict[str, Any]) -> dict[str, Any]:
    """
    Load the demo buildings, users and incidents (adds only what is missing).

    New demo accounts get `event["password"]` if given, otherwise a random password,
    which is returned once in the result and never logged.
    """
    password = event.get("password") or security.generate_temporary_password()
    if not isinstance(password, str):
        return {"ok": False, "error": "password: must be a string"}
    problem = security.password_policy_error(password)
    if problem:
        return {"ok": False, "error": f"password: {problem}"}

    with db.session_scope() as session:
        created = seed.run(session, password)

    result: dict[str, Any] = {"ok": True, "task": "seed_demo_data", "created": created}
    if created["users"]:
        result["demo_password"] = password
        result["demo_accounts"] = [email for email, *_ in seed.USERS]
        result["note"] = ("Every newly created demo account uses demo_password. "
                          "admin@acme.inc keeps its bootstrap password if it already existed.")
    else:
        result["note"] = "No new demo accounts were created; existing passwords are unchanged."
    return result


TASKS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "seed_demo_data": seed_demo_data,
}


def is_task_event(event: Any) -> bool:
    """A direct invoke naming a task, as opposed to an HTTP event (which has requestContext)."""
    return isinstance(event, dict) and "task" in event and "requestContext" not in event


def run_task(event: dict[str, Any]) -> dict[str, Any]:
    """Run the task named in the event and return its result (never raises)."""
    name = event.get("task")
    task = TASKS.get(name)
    if task is None:
        return {"ok": False, "error": f"Unknown task {name!r}. Available: {', '.join(sorted(TASKS))}"}
    logger.info("Running task %s", name)
    # Report any failure in the result instead of crashing the invoke.
    try:
        return task(event)
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.exception("Task %s failed", name)
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
