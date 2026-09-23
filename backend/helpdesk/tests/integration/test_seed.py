"""Integration tests for the local demo-data seed."""

import pytest
from sqlalchemy import func, select

from app import seed
from app.core import config, db
from app.facilities.models import Building, Floor, Seat
from app.users.models import User

pytestmark = pytest.mark.integration


def _counts() -> tuple[int, int, int, int]:
    with db.session_scope() as session:
        return tuple(session.scalar(select(func.count()).select_from(m)) for m in (User, Building, Floor, Seat))


def test_seed_creates_demo_data_and_is_idempotent(api):
    with db.session_scope() as session:
        seed.run(session)
    first = _counts()
    # 9 demo users + the bootstrap admin@acme.inc already present from the fixture
    assert first == (9, 3, 7, 29)

    with db.session_scope() as session:
        seed.run(session)
    assert _counts() == first


def test_demo_accounts_can_sign_in(api):
    with db.session_scope() as session:
        seed.run(session)
    for email in ("morgan.facilities@acme.inc", "priya.shah@acme.inc", "jane.doe@acme.inc"):
        res = api("POST", "/auth/login", {"email": email, "password": seed.DEMO_PASSWORD})
        assert res.status == 200, email
        assert res.body["user"]["must_change_password"] is False

    priya = api("POST", "/auth/login", {"email": "priya.shah@acme.inc", "password": seed.DEMO_PASSWORD})
    assert priya.body["user"]["engineer_profile"]["specialties"] == ["network", "it_hardware", "av_equipment"]


def test_seed_restores_deleted_records(api):
    with db.session_scope() as session:
        seed.run(session)
        session.delete(session.scalar(select(Seat).where(Seat.code == "LAB-01")))
    with db.session_scope() as session:
        seed.run(session)
        assert session.scalar(select(Seat).where(Seat.code == "LAB-01")) is not None


def test_reset_wipes_everything():
    with db.session_scope() as session:
        seed.run(session)
    with db.session_scope() as session:
        seed.reset(session)
    assert _counts() == (0, 0, 0, 0)


@pytest.mark.parametrize("env,expected", [
    ({"SEED_DEMO_DATA": "true", "IS_LOCAL": "true"}, True),
    ({"SEED_DEMO_DATA": "false", "IS_LOCAL": "true"}, False),
    ({"SEED_DEMO_DATA": "true", "IS_LOCAL": "false"}, False),
    ({"SEED_DEMO_DATA": "true", "IS_LOCAL": "true", "AWS_LAMBDA_FUNCTION_NAME": "fn"}, False),
])
def test_seeding_only_ever_enabled_locally(monkeypatch, env, expected):
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    assert config.seed_demo_data() is expected
