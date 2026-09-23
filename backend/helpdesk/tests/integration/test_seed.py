"""Integration tests for the local demo-data seed."""

import pytest
from sqlalchemy import func, select

from app import seed
from app.core import config, db
from app.facilities.models import Building, Floor, Seat
from app.core.constants import CATEGORIES, EVENT_TYPES, REQUEST_STATUSES
from app.incidents.models import AssignmentRequest, Incident, IncidentEvent, IncidentNote
from app.users.models import User

pytestmark = pytest.mark.integration


def _counts() -> tuple[int, ...]:
    with db.session_scope() as session:
        return tuple(session.scalar(select(func.count()).select_from(m))
                     for m in (User, Building, Floor, Seat, Incident))


def test_seed_creates_demo_data_and_is_idempotent(api):
    with db.session_scope() as session:
        seed.run(session)
    first = _counts()
    # the bootstrap admin@acme.inc already exists (from the fixture), so it isn't counted twice
    assert first == (len(seed.USERS), 3, 7, 29, len(seed.INCIDENTS))

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
    assert _counts() == (0, 0, 0, 0, 0)


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


def test_demo_incidents_cover_the_workflow(api):
    with db.session_scope() as session:
        seed.run(session)
        statuses = {s for (s,) in session.execute(select(Incident.status).distinct())}
        assert statuses == {"open", "in_progress", "blocked", "resolved", "closed"}
        assert session.scalar(select(func.count()).select_from(Incident).where(Incident.is_escalated)) >= 2
        assert session.scalar(select(func.count()).select_from(AssignmentRequest).where(
            AssignmentRequest.status == "pending")) >= 2
        # every assigned incident was acknowledged no earlier than it was reported
        for incident in session.scalars(select(Incident).where(Incident.assignee_id.is_not(None))).unique():
            assert incident.created_at <= incident.acknowledged_at <= incident.assigned_at
        # history is ordered and starts with "created"
        first = session.scalars(select(IncidentEvent).order_by(IncidentEvent.created_at, IncidentEvent.id)).first()
        assert first.type == "created"

    admin = api("POST", "/auth/login", {"email": "morgan.facilities@acme.inc", "password": seed.DEMO_PASSWORD}).body
    listed = api("GET", "/incidents", token=admin["tokens"]["access_token"], query={"escalated": "true"})
    assert listed.status == 200 and listed.body["total"] >= 2
    jane = api("POST", "/auth/login", {"email": "jane.doe@acme.inc", "password": seed.DEMO_PASSWORD}).body
    mine = api("GET", "/incidents", token=jane["tokens"]["access_token"]).body["items"]
    assert mine and all(i["reporter"]["email"] == "jane.doe@acme.inc" for i in mine)


def test_demo_data_covers_every_section(api):
    with db.session_scope() as session:
        seed.run(session)
        events = set(session.scalars(select(IncidentEvent.type).distinct()))
        assert events == set(EVENT_TYPES)
        requests = set(session.scalars(select(AssignmentRequest.status).distinct()))
        assert requests == set(REQUEST_STATUSES)
        covered = {s for profile in session.scalars(select(User)).unique() if profile.engineer_profile
                   for s in profile.engineer_profile.specialties}
        assert covered == set(CATEGORIES)
        # a reopened incident was resolved again, and its resolution is the latest one
        heater = session.scalar(select(Incident).where(Incident.title.startswith("Heater")))
        assert heater.status == "closed" and heater.resolution.startswith("Replaced the worn fan bearing")
        # staff notes include an admin's
        assert session.scalar(select(func.count()).select_from(IncidentNote)
                              .join(User, User.id == IncidentNote.author_id).where(User.role == "admin")) >= 1
        # nothing is left blocked-with-a-reason unless it is blocked
        assert not session.scalars(select(Incident).where(Incident.blocked_reason.is_not(None),
                                                          Incident.status != "blocked")).unique().all()

    assert api("POST", "/auth/login", {"email": "chris.taylor@acme.inc", "password": seed.DEMO_PASSWORD}).status == 403
    nina = api("POST", "/auth/login", {"email": "nina.patel@acme.inc", "password": seed.DEMO_PASSWORD})
    assert nina.status == 200 and nina.body["user"]["must_change_password"] is True
