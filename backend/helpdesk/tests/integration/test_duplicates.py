"""Integration tests for duplicate detection: the similar-incidents check, flags and closing as duplicate."""

import pytest
from sqlalchemy import text

from app.core import db

pytestmark = pytest.mark.integration


@pytest.fixture
def second_floor(place):
    """Another floor in the same building as `place`."""
    from app.facilities.models import Floor  # pylint: disable=import-outside-toplevel

    with db.session_scope() as session:
        floor = Floor(building_id=place["building_id"], name="Floor 2", level=2)
        session.add(floor)
        session.flush()
        return floor.id


def _similar(api, user, **query):
    res = api("GET", "/incidents/similar", token=user["token"], query={k: str(v) for k, v in query.items()})
    assert res.status == 200, res.body
    return res.body["items"]


class TestSimilarIncidents:
    def test_matches_active_incidents_in_the_same_building_and_category(self, api, employee, make_user, place, report):
        jane = make_user("employee")
        match = report(jane, title="Air conditioning not cooling", floor_id=place["floor_id"])
        report(jane, title="Leaking tap", category="plumbing")                       # other category
        report(jane, title="Air conditioning broken", building_id=place["other_building_id"])  # other building

        items = _similar(api, employee, building_id=place["building_id"], category="hvac",
                         floor_id=place["floor_id"], title="AC not cooling")
        assert [i["id"] for i in items] == [match["id"]]

    def test_returns_only_what_anyone_may_see(self, api, employee, make_user, place, report):
        jane = make_user("employee")
        report(jane, title="Air conditioning not cooling", description="Private detail")
        item = _similar(api, employee, building_id=place["building_id"], category="hvac")[0]
        assert set(item) == {"id", "title", "category", "status", "building", "floor", "seat", "created_at"}
        assert "Private detail" not in str(item)

    def test_ranks_same_floor_and_seat_first_and_skips_unrelated_floors(
            self, api, employee, make_user, place, second_floor, report):
        jane = make_user("employee")
        same_seat = report(jane, title="Heater noisy", floor_id=place["floor_id"], seat_id=place["seat_id"])
        same_floor = report(jane, title="Too warm here", floor_id=place["floor_id"])
        other_floor_shared_word = report(jane, title="Too cold on floor 2", floor_id=second_floor)
        report(jane, title="Vent rattles", floor_id=second_floor)  # different floor, no shared word: not shown
        no_floor = report(jane, title="Thermostat display blank")

        items = _similar(api, employee, building_id=place["building_id"], category="hvac",
                         floor_id=place["floor_id"], seat_id=place["seat_id"], title="Too cold")
        assert [i["id"] for i in items] == [
            same_seat["id"],                # same floor (+4) and seat (+2)
            same_floor["id"],               # same floor (+4), shares "too" (+1)
            other_floor_shared_word["id"],  # other floor, but shares "too" and "cold" (+2)
            no_floor["id"],                 # floor unknown, nothing shared (0)
        ]

    def test_ignores_closed_and_older_than_30_days(self, api, admin, employee, make_user, place, report):
        jane = make_user("employee")
        closed = report(jane, title="AC broken")
        api("POST", f"/incidents/{closed['id']}/status", {"status": "closed", "comment": "Fixed itself"},
            token=jane["token"])
        old = report(jane, title="AC broken again")
        with db.session_scope() as session:
            session.execute(text("UPDATE incidents SET created_at = now() - interval '31 days' WHERE id = :id"),
                            {"id": old["id"]})
        assert _similar(api, employee, building_id=place["building_id"], category="hvac") == []

    def test_needs_a_building_and_category_and_a_sign_in(self, api, employee):
        assert api("GET", "/incidents/similar", token=employee["token"], query={"category": "hvac"}).status == 400
        assert api("GET", "/incidents/similar", query={"building_id": "1", "category": "hvac"}).status == 401


class TestPossibleDuplicateFlag:
    def test_reporting_something_similar_flags_it_for_admins(self, api, admin, make_user, place, report):
        jane, maria = make_user("employee"), make_user("employee")
        first = report(jane, title="Air conditioning not cooling", floor_id=place["floor_id"])
        second = report(maria, title="AC not cooling at my desk", floor_id=place["floor_id"])

        assert first["possible_duplicate_of"] is None
        assert second["possible_duplicate_of"] == {"id": first["id"], "title": first["title"], "status": "open"}
        assert second["possible_duplicate_of_id"] == first["id"]

        detail = api("GET", f"/incidents/{second['id']}", token=admin["token"]).body["incident"]
        assert {"close_as_duplicate", "dismiss_possible_duplicate"} <= set(detail["allowed_actions"])
        flagged = api("GET", "/incidents", token=admin["token"], query={"possible_duplicate": "true"}).body
        assert [i["id"] for i in flagged["items"]] == [second["id"]]

    def test_admins_can_dismiss_the_flag(self, api, admin, make_user, report):
        jane = make_user("employee")
        report(jane, title="AC not cooling")
        second = report(jane, title="AC not cooling either")

        assert api("DELETE", f"/incidents/{second['id']}/possible-duplicate", token=jane["token"]).status == 403
        res = api("DELETE", f"/incidents/{second['id']}/possible-duplicate", token=admin["token"])
        assert res.status == 200 and res.body["incident"]["possible_duplicate_of"] is None
        assert "dismiss_possible_duplicate" not in res.body["incident"]["allowed_actions"]


class TestCloseAsDuplicate:
    def test_closes_with_a_link_to_the_original(self, api, admin, engineer, make_user, report):
        jane, maria = make_user("employee"), make_user("employee")
        original = report(jane, title="AC not cooling")
        dup = report(maria, title="AC not cooling on my side")
        api("POST", f"/incidents/{dup['id']}/assignment-requests", {"message": None}, token=engineer["token"])

        res = api("POST", f"/incidents/{dup['id']}/close-as-duplicate", {"duplicate_of_id": original["id"]},
                  token=admin["token"])
        assert res.status == 200, res.body
        closed = res.body["incident"]
        assert closed["status"] == "closed"
        assert closed["close_reason"] == f"Duplicate of #{original['id']}: AC not cooling"
        assert closed["duplicate_of"] == {"id": original["id"], "title": "AC not cooling", "status": "open"}
        assert closed["possible_duplicate_of"] is None

        # The reporter sees why it was closed; the engineer's pending request was settled.
        seen = api("GET", f"/incidents/{dup['id']}", token=maria["token"]).body["incident"]
        assert seen["duplicate_of"]["id"] == original["id"]
        events = api("GET", f"/incidents/{dup['id']}/events", token=admin["token"]).body["items"]
        assert events[-1]["comment"] == f"Duplicate of #{original['id']}: AC not cooling"
        requests = api("GET", "/assignment-requests", token=engineer["token"]).body["items"]
        assert requests[0]["status"] == "rejected"
        assert requests[0]["decision_note"] == "The incident was closed as a duplicate"

    def test_rejects_invalid_targets(self, api, admin, make_user, report):
        jane = make_user("employee")
        a, b, c = report(jane, title="One"), report(jane, title="Two"), report(jane, title="Three")
        url = f"/incidents/{a['id']}/close-as-duplicate"

        assert api("POST", url, {"duplicate_of_id": a["id"]}, token=admin["token"]).body["error"]["fields"] == {
            "duplicate_of_id": "An incident can't be a duplicate of itself"}
        assert api("POST", url, {"duplicate_of_id": 999999}, token=admin["token"]).status == 400

        api("POST", f"/incidents/{b['id']}/close-as-duplicate", {"duplicate_of_id": c["id"]}, token=admin["token"])
        chained = api("POST", url, {"duplicate_of_id": b["id"]}, token=admin["token"])
        assert chained.status == 400
        assert f"use #{c['id']} instead" in chained.body["error"]["fields"]["duplicate_of_id"]

        again = api("POST", f"/incidents/{b['id']}/close-as-duplicate", {"duplicate_of_id": a["id"]},
                    token=admin["token"])
        assert again.status == 409 and again.body["error"]["code"] == "INVALID_STATE"

    def test_is_for_admins_only(self, api, employee, make_user, report):
        jane = make_user("employee")
        original, dup = report(jane, title="One"), report(employee, title="Two")
        res = api("POST", f"/incidents/{dup['id']}/close-as-duplicate", {"duplicate_of_id": original["id"]},
                  token=employee["token"])
        assert res.status == 403


def test_startup_adds_the_duplicate_columns_to_an_existing_table():
    """Databases created before this feature (like the deployed one) get the new columns on start."""
    with db.get_engine().begin() as conn:
        conn.execute(text("ALTER TABLE incidents DROP COLUMN possible_duplicate_of_id, DROP COLUMN duplicate_of_id"))
    db.init_schema()
    with db.get_engine().connect() as conn:
        columns = set(conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'incidents'")).scalars())
    assert {"possible_duplicate_of_id", "duplicate_of_id"} <= columns
    db.init_schema()  # running it again is harmless
