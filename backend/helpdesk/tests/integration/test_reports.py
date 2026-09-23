"""Integration tests for the dashboard summary."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app import seed
from app.core import db

pytestmark = pytest.mark.integration


def _login(api, email):
    res = api("POST", "/auth/login", {"email": email, "password": seed.DEMO_PASSWORD})
    return res.body["tokens"]["access_token"]


def _summary(api, token, **query):
    res = api("GET", "/reports/summary", token=token, query=query or None)
    assert res.status == 200, res.body
    return res.body


def _counts(items):
    return {c["key"]: c["count"] for c in items}


@pytest.fixture
def demo():
    """The seeded demo data (see app/seed.py INCIDENTS for the scenarios)."""
    with db.session_scope() as session:
        seed.run(session)


class TestAdminDashboard:
    def test_totals_and_breakdowns(self, api, demo):
        body = _summary(api, _login(api, "morgan.facilities@acme.inc"))
        assert body["scope"] == "all"
        assert body["totals"] == {
            "total": 22, "active": 9, "unassigned_open": 4, "escalated_active": 2,
            "reported_in_window": 21, "resolved_in_window": 10, "available_pool": None,
        }
        assert _counts(body["by_status"]) == {"open": 4, "in_progress": 3, "blocked": 2, "resolved": 4, "closed": 9}
        assert [c["key"] for c in body["by_priority"]] == ["critical", "high", "medium", "low"]
        assert _counts(body["by_priority"]) == {"critical": 2, "high": 4, "medium": 1, "low": 2}
        categories = body["by_category"]
        assert sum(c["count"] for c in categories) == 21  # the garage one is 45 days old
        assert categories[0]["count"] >= categories[-1]["count"]

    def test_workload_and_availability(self, api, demo):
        workload = _summary(api, _login(api, "morgan.facilities@acme.inc"))["workload"]
        rows = {w["full_name"]: w for w in workload}
        assert [w["full_name"] for w in workload] == [
            "Sam Rivera", "Diego Martinez", "Lee Chen", "Priya Shah", "Tom Okafor"]
        assert (rows["Sam Rivera"]["active"], rows["Sam Rivera"]["in_progress"]) == (2, 2)
        assert (rows["Lee Chen"]["blocked"], rows["Lee Chen"]["availability"]) == (1, "off_duty")
        assert rows["Priya Shah"]["resolved_in_window"] == 3
        assert {n: rows[n]["pending_requests"] for n in rows} == {
            "Sam Rivera": 1, "Priya Shah": 1, "Lee Chen": 1, "Diego Martinez": 0, "Tom Okafor": 1}

    def test_attention_hotspots_and_trend(self, api, demo):
        body = _summary(api, _login(api, "morgan.facilities@acme.inc"))
        escalated = body["attention"]["escalated"]
        assert [i["title"] for i in escalated] == [
            "Air conditioning not cooling on Floor 2", "Badge reader at side door rejects all badges"]
        assert escalated[0]["reason"].startswith("Several people")
        blocked = body["attention"]["blocked"]
        assert [i["title"] for i in blocked] == [          # longest blocked first
            "Badge reader at side door rejects all badges", "Leaking pipe under kitchen sink"]
        assert blocked[1]["reason"].startswith("Waiting for a replacement valve")
        assert blocked[1]["assignee_name"] == "Diego Martinez"

        assert [(b["label"], b["count"]) for b in body["hotspots"]["buildings"]] == [
            ("HQ Tower", 13), ("Riverside Annex", 5), ("Innovation Lab", 3)]
        assert body["hotspots"]["floors"][0]["label"].startswith("HQ Tower · ")

        assert len(body["trend"]) == 31
        assert sum(p["reported"] for p in body["trend"]) == 21
        assert sum(p["resolved"] for p in body["trend"]) == 10

    def test_building_filter(self, api, demo):
        token = _login(api, "morgan.facilities@acme.inc")
        buildings = api("GET", "/buildings", token=token, query={"q": "Riverside"}).body["items"]
        body = _summary(api, token, building_id=str(buildings[0]["id"]))
        assert body["totals"]["total"] == 5


class TestRoleScopes:
    def test_engineer_sees_own_work_and_pool(self, api, demo):
        body = _summary(api, _login(api, "priya.shah@acme.inc"))
        assert body["scope"] == "assigned"
        assert (body["totals"]["total"], body["totals"]["active"], body["totals"]["available_pool"]) == (4, 1, 4)
        assert body["workload"] is None and body["hotspots"] is None and body["communication"] is None

    def test_employee_sees_own_tickets_and_communication(self, api, demo):
        body = _summary(api, _login(api, "maria.garcia@acme.inc"))
        assert body["scope"] == "reported"
        assert body["totals"]["total"] == 7
        assert body["communication"]["incidents"] == 7
        assert body["communication"]["with_staff_note"] == 4
        assert body["communication"]["with_staff_note_pct"] == 57.1
        assert body["workload"] is None and body["hotspots"] is None

    def test_requires_sign_in_and_validates(self, api, demo):
        assert api("GET", "/reports/summary").status == 401
        token = _login(api, "jane.doe@acme.inc")
        assert api("GET", "/reports/summary", token=token, query={"days": "0"}).status == 400


class TestResponseTimes:
    def test_hours_are_exact(self, api, admin, employee, report):
        now = datetime.now(timezone.utc)
        a, b = report(employee), report(employee)
        with db.session_scope() as session:
            for incident_id, created, ack, assigned, resolved in (
                (a["id"], now - timedelta(hours=10), 1, 2, 4),
                (b["id"], now - timedelta(hours=5), 3, 4, None),
            ):
                session.execute(text(
                    "UPDATE incidents SET created_at = :c, acknowledged_at = :ack, assigned_at = :asg,"
                    " resolved_at = :res WHERE id = :id"), {
                        "c": created, "ack": created + timedelta(hours=ack),
                        "asg": created + timedelta(hours=assigned),
                        "res": created + timedelta(hours=resolved) if resolved else None, "id": incident_id})
        times = _summary(api, admin["token"])["response_times"]
        assert times["acknowledge"] == {"count": 2, "avg_hours": 2.0, "median_hours": 2.0}
        assert times["assign"] == {"count": 2, "avg_hours": 3.0, "median_hours": 3.0}
        assert times["resolve"] == {"count": 1, "avg_hours": 4.0, "median_hours": 4.0}

    def test_window_excludes_old_incidents(self, api, admin, employee, report):
        old, _ = report(employee), report(employee)
        with db.session_scope() as session:
            session.execute(text("UPDATE incidents SET created_at = now() - interval '40 days' WHERE id = :id"),
                            {"id": old["id"]})
        last_30 = _summary(api, admin["token"])["totals"]
        assert (last_30["total"], last_30["reported_in_window"]) == (2, 1)
        assert _summary(api, admin["token"], days="60")["totals"]["reported_in_window"] == 2

    def test_empty_database(self, api, admin):
        body = _summary(api, admin["token"])
        assert body["totals"]["total"] == 0
        assert body["response_times"]["resolve"] == {"count": 0, "avg_hours": None, "median_hours": None}
        assert body["communication"]["with_staff_note_pct"] is None
        assert body["hotspots"] == {"buildings": [], "floors": [], "seats": []}
