"""
Runtime configuration read from environment variables.

Values are read on access (not at import time) so tests can override them.
For local development, variables can also come from a git-ignored
backend/helpdesk/.env.local file (never loaded on AWS Lambda; real
environment variables always win).
"""

import os
from pathlib import Path
from typing import Optional

from sqlalchemy.engine import URL

LOCAL_ENV_FILE = Path(__file__).resolve().parents[2] / ".env.local"


def running_on_lambda() -> bool:
    """True inside AWS Lambda."""
    return bool(os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


def _load_local_env_file() -> None:
    if running_on_lambda() or not LOCAL_ENV_FILE.exists():
        return
    try:
        from dotenv import load_dotenv  # pylint: disable=import-outside-toplevel
    except ImportError:  # python-dotenv is a dev-only dependency
        return
    load_dotenv(LOCAL_ENV_FILE, override=False)


_load_local_env_file()

ACCESS_TOKEN_TTL_SECONDS = 30 * 60
REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

# Requests may arrive with the CloudFront prefix (/api/helpdesk/...) or without it
# when the local proxy has already stripped it.
API_PREFIX = "/api/helpdesk"


def is_local() -> bool:
    """Return True when running against LocalStack / local PostgreSQL."""
    return os.getenv("IS_LOCAL", "false") == "true"


def postgres_url(database: Optional[str] = None) -> URL:
    """
    Build the SQLAlchemy URL from the injected POSTGRES_* variables.

    Args:
        database: Override the database name (e.g. "postgres" for admin tasks).
    """
    return URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASS", "postgres123"),
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        database=database or os.getenv("POSTGRES_NAME", "postgres"),
        query={} if is_local() else {"sslmode": "require"},
    )


def seed_demo_data() -> bool:
    """
    True when demo users and facilities should be created at startup.

    Only ever honoured locally: demo accounts have well-known passwords.
    """
    return os.getenv("SEED_DEMO_DATA", "false") == "true" and is_local() and not running_on_lambda()


def jwt_secret() -> str:
    """Return the JWT signing key; fail loudly if it is missing."""
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set")
    return secret


def bootstrap_admin() -> tuple[str, str]:
    """Return (email, password) for the initial admin account."""
    return (
        os.getenv("ADMIN_BOOTSTRAP_EMAIL", "admin@acme.inc").strip().lower(),
        os.getenv("ADMIN_BOOTSTRAP_PASSWORD", ""),
    )
