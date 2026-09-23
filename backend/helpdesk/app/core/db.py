"""
Database engine and session management.

The engine (and its connection pool) lives at module level so a warm Lambda
container reuses connections across invocations. Each request runs in one
Session, committed on success and rolled back on any error (see app.main).
Tables are created from the ORM models once per container.
"""

import logging
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.core import config, security
from app.core.constants import ROLE_ADMIN
from app.core.orm import Base
from app.models import User

logger = logging.getLogger(__name__)

# Arbitrary key so concurrent cold starts don't create tables at the same time.
_SCHEMA_LOCK_KEY = 7_340_001

_engine: Optional[Engine] = None
_session_factory: Optional[sessionmaker] = None
_initialized = False


def get_engine() -> Engine:
    """Return the shared engine, creating it on first use."""
    global _engine, _session_factory  # pylint: disable=global-statement
    if _engine is None:
        _engine = create_engine(
            config.postgres_url(),
            pool_pre_ping=True,       # transparently replace connections dropped while idle
            pool_recycle=300,
            connect_args={"connect_timeout": 15},
        )
        _session_factory = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def new_session() -> Session:
    """Open a new Session (caller is responsible for commit/rollback/close)."""
    get_engine()
    if not _initialized:
        init_schema()
    return _session_factory()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Provide a Session wrapped in a transaction: commit on success, roll back on error."""
    session = new_session()
    try:
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()


def reset() -> None:
    """Drop all pooled connections so the next request reconnects."""
    global _engine, _session_factory  # pylint: disable=global-statement
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def init_schema() -> None:
    """Create any missing tables and make sure an admin account exists."""
    global _initialized  # pylint: disable=global-statement
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _SCHEMA_LOCK_KEY})
        Base.metadata.create_all(conn)
    _initialized = True

    with session_scope() as session:
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _SCHEMA_LOCK_KEY})
        ensure_bootstrap_admin(session)


def ensure_bootstrap_admin(session: Session) -> None:
    """
    Create the initial admin when no active admin exists.

    The account must change its password on first login. If the bootstrap email
    is already taken (recovery case), that account is promoted and its password reset.
    """
    has_admin = session.scalar(
        select(User.id).where(User.role == ROLE_ADMIN, User.is_active).limit(1)
    )
    if has_admin:
        return
    email, password = config.bootstrap_admin()
    if not password:
        logger.warning("No active admin exists and ADMIN_BOOTSTRAP_PASSWORD is not set")
        return

    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, full_name="System Administrator", password_hash="", role=ROLE_ADMIN)
        session.add(user)
    else:
        user.token_version = User.token_version + 1
    user.role = ROLE_ADMIN
    user.is_active = True
    user.password_hash = security.hash_password(password)
    user.must_change_password = True
    session.flush()
    logger.info("Bootstrap admin %s ready", email)
