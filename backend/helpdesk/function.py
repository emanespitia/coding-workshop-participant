"""
AWS Lambda entry point: the FastAPI app wrapped by Mangum, which converts
Lambda Function URL events to ASGI requests and back.
"""

import logging

from mangum import Mangum

from app.main import app

logging.getLogger().setLevel(logging.INFO)

handler = Mangum(app, lifespan="off")
