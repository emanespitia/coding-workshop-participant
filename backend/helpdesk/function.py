"""
AWS Lambda entry point.

HTTP requests (Function URL, via CloudFront) go to the FastAPI app through Mangum.
Direct invokes naming a task (e.g. {"task": "seed_demo_data"}) run an operator task
from app/tasks.py instead; see backend/helpdesk/README.md.
"""

import logging

from mangum import Mangum

from app.core.memory import return_large_blocks_to_os

# Before anything else allocates: stop sign-ins from permanently using ~16 MB (see app/core/memory.py).
return_large_blocks_to_os()

from app.main import app  # pylint: disable=wrong-import-position
from app.tasks import is_task_event, run_task  # pylint: disable=wrong-import-position

logging.getLogger().setLevel(logging.INFO)

_http = Mangum(app, lifespan="off")


def handler(event, context):
    """Route a Lambda event to an operator task or to the HTTP API."""
    if is_task_event(event):
        return run_task(event)
    return _http(event, context)
