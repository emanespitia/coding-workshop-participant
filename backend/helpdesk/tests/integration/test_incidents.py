"""Integration tests for incidents: reporting, visibility, search, editing, workflow."""

import pytest

pytestmark = pytest.mark.integration


def _status(api, user, incident_id, status, comment=None):
    body = {"status": status} if comment is None else {"status": status, "comment": comment}
    return api("POST", f"/incidents/{incident_id}/status", body, token=user["token"])


def _assign(api, admin, incident_id, engineer_id):
    return api("POST", f"/incidents/{incident_id}/assign", {"engineer_id": engineer_id}, token=admin["token"])


class TestReport:
    def test_create_with_full_location(self, api, employee, place, report):
        inc = report(employee, floor_id=place["floor_id"], seat_id=place["seat_id"], priority="high")
        assert inc["status"] == "open"
        assert inc["priority"] == "high"
        assert inc["reporter"]["id"] == employee["id"]
        assert inc["assignee"] is None
        assert inc["building"]["name"] == "HQ"
        assert inc["seat"]["code"] == "G-01"
        assert inc["acknowledged_at"] is None
        assert inc["allowed_transitions"] == ["closed"]
        assert set(inc["allowed_actions"]) == {"edit", "escalate", "add_note"}

    def test_priority_defaults_to_medium(self, employee, report):
        assert report(employee)["priority"] == "medium"

    @pytest.mark.parametrize("fields,field", [
        ({"building_id": 999}, "building_id"),
        ({"floor_id": 999}, "floor_id"),
        ({"seat_id": 1}, "seat_id"),                       # seat without floor
    ])
    def test_invalid_location(self, api, employee, place, fields, field):
        body = {"title": "T", "description": "D", "category": "hvac", "building_id": place["building_id"], **fields}
        res = api("POST", "/incidents", body, token=employee["token"])
        assert res.status == 400
        assert field in res.body["error"]["fields"]

    def test_floor_from_another_building(self, api, employee, place):
        res = api("POST", "/incidents", {
            "title": "T", "description": "D", "category": "hvac",
            "building_id": place["building_id"], "floor_id": place["other_floor_id"],
        }, token=employee["token"])
        assert res.body["error"]["fields"] == {"floor_id": "This floor is not in the selected building"}

    def test_validation(self, api, employee, place):
        res = api("POST", "/incidents", {"title": " ", "category": "magic", "priority": "urgent",
                                         "building_id": place["building_id"]}, token=employee["token"])
        assert set(res.body["error"]["fields"]) == {"title", "description", "category", "priority"}

    def test_requires_sign_in(self, api):
        assert api("POST", "/incidents", {}).status == 401


class TestVisibility:
    def test_employees_see_only_their_own(self, api, make_user, report):
        jane, john = make_user(), make_user()
        mine = report(jane)
        report(john)
        listed = api("GET", "/incidents", token=jane["token"]).body
        assert [i["id"] for i in listed["items"]] == [mine["id"]]
        assert api("GET", f"/incidents/{mine['id']}", token=john["token"]).status == 404

    def test_engineers_see_pool_and_own_work(self, api, admin, engineer, make_user, employee, report):
        other = make_user("engineer")
        pool = report(employee, title="pool")
        mine = report(employee, title="mine")
        theirs = report(employee, title="theirs")
        _assign(api, admin, mine["id"], engineer["id"])
        _assign(api, admin, theirs["id"], other["id"])
        visible = {i["title"] for i in api("GET", "/incidents", token=engineer["token"]).body["items"]}
        assert visible == {"pool", "mine"}
        assert api("GET", f"/incidents/{theirs['id']}", token=engineer["token"]).status == 404
        assert api("GET", f"/incidents/{pool['id']}", token=engineer["token"]).status == 200

    def test_admin_sees_everything(self, api, admin, make_user, report):
        report(make_user())
        report(make_user())
        assert api("GET", "/incidents", token=admin["token"]).body["total"] == 2


class TestSearch:
    @pytest.fixture
    def incidents(self, api, admin, employee, engineer, place, report):
        a = report(employee, title="Printer jam", category="it_hardware", priority="low")
        b = report(employee, title="Leaking tap", description="Kitchen sink", category="plumbing",
                   priority="critical", floor_id=place["floor_id"])
        c = report(employee, title="Door badge fails", category="access_control", priority="high")
        _assign(api, admin, c["id"], engineer["id"])
        api("POST", f"/incidents/{b['id']}/escalate", {"reason": "Flooding"}, token=employee["token"])
        return a, b, c

    def _titles(self, api, admin, **query):
        res = api("GET", "/incidents", token=admin["token"], query=query)
        assert res.status == 200, res.body
        return [i["title"] for i in res.body["items"]]

    def test_filters(self, api, admin, engineer, place, incidents):
        assert self._titles(api, admin, q="kitchen") == ["Leaking tap"]
        assert self._titles(api, admin, q=f"#{incidents[0]['id']}") == ["Printer jam"]
        assert self._titles(api, admin, category="plumbing,it_hardware", sort="created_at") == [
            "Printer jam", "Leaking tap"]
        assert self._titles(api, admin, priority="critical") == ["Leaking tap"]
        assert self._titles(api, admin, escalated="true") == ["Leaking tap"]
        assert self._titles(api, admin, unassigned="false") == ["Door badge fails"]
        assert self._titles(api, admin, assignee_id=str(engineer["id"])) == ["Door badge fails"]
        assert self._titles(api, admin, floor_id=str(place["floor_id"])) == ["Leaking tap"]
        assert self._titles(api, admin, status="open", sort="-priority") == [
            "Leaking tap", "Door badge fails", "Printer jam"]

    def test_scopes(self, api, engineer, employee, incidents):
        mine = api("GET", "/incidents", token=engineer["token"], query={"scope": "assigned"}).body["items"]
        assert [i["title"] for i in mine] == ["Door badge fails"]
        pool = api("GET", "/incidents", token=engineer["token"], query={"scope": "available"}).body["items"]
        assert {i["title"] for i in pool} == {"Printer jam", "Leaking tap"}
        reported = api("GET", "/incidents", token=employee["token"], query={"scope": "reported"}).body
        assert reported["total"] == 3

    def test_pagination_and_bad_query(self, api, admin, incidents):
        page = api("GET", "/incidents", token=admin["token"], query={"page": "2", "page_size": "2"}).body
        assert (page["total"], len(page["items"]), page["page"]) == (3, 1, 2)
        for bad in ({"status": "done"}, {"sort": "title"}, {"scope": "everyone"}, {"page_size": "500"}):
            assert api("GET", "/incidents", token=admin["token"], query=bad).status == 400, bad


class TestEdit:
    def test_reporter_edits_while_open(self, api, employee, place, report):
        inc = report(employee)
        res = api("PATCH", f"/incidents/{inc['id']}", {
            "title": "Aircon broken", "floor_id": place["floor_id"], "seat_id": place["seat_id"],
        }, token=employee["token"])
        assert res.status == 200
        assert res.body["incident"]["title"] == "Aircon broken"
        assert res.body["incident"]["seat"]["code"] == "G-01"

    def test_reporter_cannot_change_priority(self, api, employee, report):
        inc = report(employee)
        res = api("PATCH", f"/incidents/{inc['id']}", {"priority": "critical"}, token=employee["token"])
        assert res.status == 403
        assert res.error_code == "FORBIDDEN_FIELD"

    def test_reporter_cannot_edit_after_work_starts(self, api, admin, engineer, employee, report):
        inc = report(employee)
        _assign(api, admin, inc["id"], engineer["id"])
        _status(api, engineer, inc["id"], "in_progress")
        assert api("PATCH", f"/incidents/{inc['id']}", {"title": "x"}, token=employee["token"]).status == 403

    def test_admin_changes_priority_and_moving_building_clears_floor(self, api, admin, employee, place, report):
        inc = report(employee, floor_id=place["floor_id"], seat_id=place["seat_id"])
        res = api("PATCH", f"/incidents/{inc['id']}", {
            "priority": "critical", "building_id": place["other_building_id"],
        }, token=admin["token"])
        assert res.status == 200
        body = res.body["incident"]
        assert (body["priority"], body["building"]["name"], body["floor"], body["seat"]) == (
            "critical", "Annex", None, None)
        events = api("GET", f"/incidents/{inc['id']}/events", token=admin["token"]).body["items"]
        assert [e["type"] for e in events] == ["created", "priority_changed", "updated"]
        assert (events[1]["from_value"], events[1]["to_value"]) == ("medium", "critical")

    def test_others_cannot_edit(self, api, admin, engineer, employee, report):
        inc = report(employee)
        _assign(api, admin, inc["id"], engineer["id"])
        assert api("PATCH", f"/incidents/{inc['id']}", {"title": "x"}, token=engineer["token"]).status == 403


class TestWorkflow:
    def test_full_lifecycle(self, api, admin, engineer, employee, report):
        inc = report(employee)
        assert _status(api, engineer, inc["id"], "in_progress").status == 403      # visible (pool), not assigned
        res = _assign(api, admin, inc["id"], engineer["id"])
        assert res.body["incident"]["acknowledged_at"] is not None
        assert res.body["incident"]["assigned_at"] is not None

        as_engineer = api("GET", f"/incidents/{inc['id']}", token=engineer["token"]).body["incident"]
        assert as_engineer["allowed_transitions"] == ["in_progress"]

        assert _status(api, engineer, inc["id"], "in_progress").status == 200
        blocked = _status(api, engineer, inc["id"], "blocked", "Waiting for parts")
        assert blocked.body["incident"]["blocked_reason"] == "Waiting for parts"
        unblocked = _status(api, engineer, inc["id"], "in_progress")
        assert unblocked.body["incident"]["blocked_reason"] is None
        resolved = _status(api, engineer, inc["id"], "resolved", "Replaced the fan")
        assert resolved.body["incident"]["resolution"] == "Replaced the fan"
        assert resolved.body["incident"]["resolved_at"] is not None
        assert resolved.body["incident"]["allowed_transitions"] == []           # engineer is done

        closed = _status(api, admin, inc["id"], "closed")
        assert closed.body["incident"]["status"] == "closed"
        assert closed.body["incident"]["closed_at"] is not None

        events = api("GET", f"/incidents/{inc['id']}/events", token=employee["token"]).body["items"]
        assert [(e["type"], e["to_value"]) for e in events] == [
            ("created", "open"), ("assigned", engineer["full_name"]),
            ("status_changed", "in_progress"), ("status_changed", "blocked"),
            ("status_changed", "in_progress"), ("status_changed", "resolved"), ("status_changed", "closed"),
        ]
        assert events[3]["comment"] == "Waiting for parts"
        assert events[1]["actor"]["id"] == admin["id"]

    def test_invalid_and_unauthorized_transitions(self, api, admin, engineer, employee, report):
        inc = report(employee)
        assert _status(api, employee, inc["id"], "in_progress").status == 403
        start = _status(api, admin, inc["id"], "in_progress")
        assert (start.status, start.error_code) == (409, "NO_ASSIGNEE")
        jump = _status(api, admin, inc["id"], "resolved", "x")
        assert (jump.status, jump.error_code) == (409, "INVALID_TRANSITION")
        _assign(api, admin, inc["id"], engineer["id"])
        _status(api, engineer, inc["id"], "in_progress")
        assert _status(api, engineer, inc["id"], "closed", "done").status == 403   # engineers resolve, not close
        assert _status(api, employee, inc["id"], "blocked", "x").status == 403

    @pytest.mark.parametrize("target", ["blocked", "resolved"])
    def test_comment_required(self, api, admin, engineer, employee, report, target):
        inc = report(employee)
        _assign(api, admin, inc["id"], engineer["id"])
        _status(api, engineer, inc["id"], "in_progress")
        res = _status(api, engineer, inc["id"], target)
        assert res.status == 400
        assert "comment" in res.body["error"]["fields"]

    def test_reporter_cancels_open_ticket(self, api, employee, report):
        inc = report(employee)
        assert _status(api, employee, inc["id"], "closed").status == 400        # reason required
        res = _status(api, employee, inc["id"], "closed", "Fixed itself")
        assert res.body["incident"]["close_reason"] == "Fixed itself"
        assert res.body["incident"]["allowed_actions"] == []
        assert api("PATCH", f"/incidents/{inc['id']}", {"title": "x"}, token=employee["token"]).status == 403

    def test_admin_reopens_resolved(self, api, admin, engineer, employee, report):
        inc = report(employee)
        _assign(api, admin, inc["id"], engineer["id"])
        _status(api, engineer, inc["id"], "in_progress")
        _status(api, engineer, inc["id"], "resolved", "Done")
        assert _status(api, employee, inc["id"], "in_progress", "Still broken").status == 403
        res = _status(api, admin, inc["id"], "in_progress", "Still broken")
        assert res.status == 200
        assert (res.body["incident"]["resolution"], res.body["incident"]["resolved_at"]) == (None, None)


class TestAssignment:
    def test_unassign_mid_work_returns_to_open(self, api, admin, engineer, employee, report):
        inc = report(employee)
        _assign(api, admin, inc["id"], engineer["id"])
        _status(api, engineer, inc["id"], "in_progress")
        _status(api, engineer, inc["id"], "blocked", "Parts")
        res = _assign(api, admin, inc["id"], None)
        assert (res.body["incident"]["status"], res.body["incident"]["assignee"]) == ("open", None)
        assert res.body["incident"]["blocked_reason"] is None

    def test_reassign_and_validation(self, api, admin, engineer, make_user, employee, report):
        inc = report(employee)
        other = make_user("engineer")
        _assign(api, admin, inc["id"], engineer["id"])
        res = _assign(api, admin, inc["id"], other["id"])
        assert res.body["incident"]["assignee"]["id"] == other["id"]
        assert _assign(api, admin, inc["id"], employee["id"]).status == 400      # not an engineer
        inactive = make_user("engineer", is_active=False)
        assert _assign(api, admin, inc["id"], inactive["id"]).status == 400

    def test_only_admins_assign(self, api, engineer, employee, report):
        inc = report(employee)
        assert _assign(api, engineer, inc["id"], engineer["id"]).status == 403

    def test_cannot_assign_closed(self, api, admin, engineer, employee, report):
        inc = report(employee)
        _status(api, employee, inc["id"], "closed", "dup")
        res = _assign(api, admin, inc["id"], engineer["id"])
        assert (res.status, res.error_code) == (409, "INVALID_STATE")


class TestEscalation:
    def test_reporter_escalates_once_admin_clears(self, api, admin, employee, report):
        inc = report(employee)
        res = api("POST", f"/incidents/{inc['id']}/escalate", {"reason": "Server room overheating"},
                  token=employee["token"])
        assert res.body["incident"]["is_escalated"] is True
        assert res.body["incident"]["escalation_reason"] == "Server room overheating"
        again = api("POST", f"/incidents/{inc['id']}/escalate", {"reason": "x"}, token=employee["token"])
        assert again.error_code == "ALREADY_ESCALATED"
        assert api("DELETE", f"/incidents/{inc['id']}/escalation", token=employee["token"]).status == 403
        cleared = api("DELETE", f"/incidents/{inc['id']}/escalation", token=admin["token"])
        assert cleared.body["incident"]["is_escalated"] is False

    def test_engineer_cannot_escalate(self, api, admin, engineer, employee, report):
        inc = report(employee)
        _assign(api, admin, inc["id"], engineer["id"])
        res = api("POST", f"/incidents/{inc['id']}/escalate", {"reason": "x"}, token=engineer["token"])
        assert res.status == 403

    def test_reason_required(self, api, employee, report):
        inc = report(employee)
        assert api("POST", f"/incidents/{inc['id']}/escalate", {}, token=employee["token"]).status == 400


class TestDeletion:
    def test_admin_deletes_incident(self, api, admin, employee, report):
        inc = report(employee)
        assert api("DELETE", f"/incidents/{inc['id']}", token=employee["token"]).status == 403
        assert api("DELETE", f"/incidents/{inc['id']}", token=admin["token"]).status == 204
        assert api("GET", f"/incidents/{inc['id']}", token=admin["token"]).status == 404

    def test_referenced_building_and_reporter_cannot_be_deleted(self, api, admin, employee, place, report):
        report(employee, floor_id=place["floor_id"], seat_id=place["seat_id"])
        for path in (f"/buildings/{place['building_id']}", f"/floors/{place['floor_id']}",
                     f"/seats/{place['seat_id']}"):
            res = api("DELETE", path, token=admin["token"])
            assert (res.status, res.error_code) == (409, "IN_USE"), path
        res = api("DELETE", f"/users/{employee['id']}", token=admin["token"])
        assert (res.status, res.error_code) == (409, "USER_HAS_HISTORY")

    def test_engineer_with_open_work_cannot_be_demoted_or_deactivated(self, api, admin, engineer, employee,
                                                                       report):
        inc = report(employee)
        _assign(api, admin, inc["id"], engineer["id"])
        for change in ({"role": "employee"}, {"is_active": False}):
            res = api("PATCH", f"/users/{engineer['id']}", change, token=admin["token"])
            assert (res.status, res.error_code) == (409, "ENGINEER_HAS_OPEN_INCIDENTS")
            assert f"#{inc['id']}" in res.body["error"]["message"]
        _status(api, engineer, inc["id"], "in_progress")
        _status(api, engineer, inc["id"], "resolved", "done")
        assert api("PATCH", f"/users/{engineer['id']}", {"is_active": False}, token=admin["token"]).status == 200
