"""
AWS Lambda entry point for the ACME facility helpdesk API.

All routes are served under /api/helpdesk/... (see app.main for the pipeline).
"""

import logging

from app.main import handle

logging.getLogger().setLevel(logging.INFO)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """
    Lambda handler for Function URL events.

    Args:
        event: Lambda Function URL event (payload format 2.0).
        context: Lambda context (unused).

    Returns:
        dict: statusCode, headers and JSON body.
    """
    return handle(event)
