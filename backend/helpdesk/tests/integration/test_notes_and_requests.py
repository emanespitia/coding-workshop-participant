"""Integration tests for incident notes and engineer assignment requests."""

import pytest

pytestmark = pytest.mark.integration


def _note(api, user, incident_id, body="Any update?"):
    return api("POST", f"/incidents/{incident_id}/notes", {"body": body}, token=user["token"])


def _request(api, engineer, incident_id, message=None):
    body = {} if message is None else {"message": message}
    return api("POST", f"/incidents/{incident_id}/assignment-requests", body, token=engineer["token"])


class TestNotes:
    def test_conversation_between_reporter_and_engineer(self, api, admin, engineer, employee, report):
        inc = report(employee)
        api("POST", f"/incidents/{inc['id']}/assign", {"engineer_id": engineer["id"]}, token=admin["token"])
        assert _note(api, employee, inc["id"], "Is someone coming?").status == 201
        reply = _note(api, engineer, inc["id"], "On my way")
        assert reply.body["note"]["author"]["id"] == engineer["id"]
        notes = api("GET", f"/incidents/{inc['id']}/notes", token=employee["token"]).body["items"]
        assert [n["body"] for n in notes] == ["Is someone coming?", "On my way"]

    def test_note_by_reporter_does_not_acknowledge_but_staff_note_does(self, api, admin, employee, report):
        inc = report(employee)
        _note(api, employee, inc["id"])
        assert api("GET", f"/incidents/{inc['id']}", token=admin["token"]).body["incident"]["acknowledged_at"] is None
        _note(api, admin, inc["id"], "Looking into it")
        assert api("GET", f"/incidents/{inc['id']}", token=admin["token"]).body["incident"]["acknowledged_at"]

    def test_non_participants_cannot_post(self, api, engineer, make_user, employee, report):
        inc = report(employee)
        assert _note(api, engineer, inc["id"]).status == 403          # sees the pool, not a participant
        assert _note(api, make_user(), inc["id"]).status == 404       # can't even see it

    def test_edit_and_delete_rules(self, api, admin, employee, make_user, report):
        inc = report(employee)
        note = _note(api, employee, inc["id"]).body["note"]
        path = f"/incidents/{inc['id']}/notes/{note['id']}"
        assert api("PATCH", path, {"body": "Edited"}, token=admin["token"]).status == 403
        edited = api("PATCH", path, {"body": "Edited"}, token=employee["token"])
        assert edited.body["note"]["body"] == "Edited"
        assert api("DELETE", path, token=admin["token"]).status == 204        # admins can delete any note
        assert api("DELETE", path, token=employee["token"]).status == 404

    def test_closed_incident_is_read_only(self, api, employee, report):
        inc = report(employee)
        note = _note(api, employee, inc["id"]).body["note"]
        api("POST", f"/incidents/{inc['id']}/status", {"status": "closed", "comment": "dup"}, token=employee["token"])
        assert _note(api, employee, inc["id"]).error_code == "INVALID_STATE"
        res = api("PATCH", f"/incidents/{inc['id']}/notes/{note['id']}", {"body": "x"}, token=employee["token"])
        assert res.error_code == "INVALID_STATE"

    def test_validation_and_wrong_incident(self, api, employee, report):
        a, b = report(employee), report(employee)
        assert _note(api, employee, a["id"], "   ").status == 400
        note = _note(api, employee, a["id"]).body["note"]
        assert api("DELETE", f"/incidents/{b['id']}/notes/{note['id']}", token=employee["token"]).status == 404


class TestAssignmentRequests:
    def test_request_then_approve_assigns_and_rejects_others(self, api, admin, engineer, make_user, employee,
                                                              report):
        other = make_user("engineer")
        inc = report(employee)
        mine = _request(api, engineer, inc["id"], "I'm nearby")
        assert mine.status == 201
        assert mine.body["request"]["status"] == "pending"
        theirs = _request(api, other, inc["id"]).body["request"]

        detail = api("GET", f"/incidents/{inc['id']}", token=engineer["token"]).body["incident"]
        assert detail["my_assignment_request"]["status"] == "pending"
        assert "request_assignment" not in detail["allowed_actions"]

        approved = api("POST", f"/assignment-requests/{mine.body['request']['id']}/approve",
                       {"note": "Go ahead"}, token=admin["token"])
        assert approved.status == 200
        assert approved.body["request"]["status"] == "approved"
        assert approved.body["request"]["decision_note"] == "Go ahead"
        assert approved.body["request"]["decided_by"]["id"] == admin["id"]

        incident = api("GET", f"/incidents/{inc['id']}", token=engineer["token"]).body["incident"]
        assert incident["assignee"]["id"] == engineer["id"]
        assert incident["allowed_transitions"] == ["in_progress"]

        rejected = api("GET", "/assignment-requests", token=other["token"]).body["items"]
        assert [(r["id"], r["status"]) for r in rejected] == [(theirs["id"], "rejected")]
        assert engineer["full_name"] in rejected[0]["decision_note"]

    def test_duplicate_and_unavailable(self, api, admin, engineer, employee, report):
        inc = report(employee)
        _request(api, engineer, inc["id"])
        assert _request(api, engineer, inc["id"]).error_code == "ALREADY_REQUESTED"
        api("POST", f"/incidents/{inc['id']}/assign", {"engineer_id": engineer["id"]}, token=admin["token"])
        assert _request(api, engineer, inc["id"]).error_code == "NOT_AVAILABLE"

    def test_only_engineers_request(self, api, admin, employee, report):
        inc = report(employee)
        assert _request(api, employee, inc["id"]).status == 403
        assert _request(api, admin, inc["id"]).status == 403

    def test_reject_and_withdraw(self, api, admin, engineer, make_user, employee, report):
        inc = report(employee)
        req = _request(api, engineer, inc["id"]).body["request"]
        rejected = api("POST", f"/assignment-requests/{req['id']}/reject", {"note": "Need HVAC skills"},
                       token=admin["token"])
        assert rejected.body["request"]["status"] == "rejected"
        again = api("POST", f"/assignment-requests/{req['id']}/approve", {}, token=admin["token"])
        assert again.error_code == "REQUEST_NOT_PENDING"

        second = _request(api, engineer, inc["id"]).body["request"]           # can ask again after rejection
        other = make_user("engineer")
        assert api("POST", f"/assignment-requests/{second['id']}/withdraw", token=other["token"]).status == 403
        withdrawn = api("POST", f"/assignment-requests/{second['id']}/withdraw", token=engineer["token"])
        assert withdrawn.body["request"]["status"] == "withdrawn"

        events = api("GET", f"/incidents/{inc['id']}/events", token=admin["token"]).body["items"]
        assert [e["type"] for e in events] == [
            "created", "assignment_requested", "assignment_rejected", "assignment_requested"]

    def test_approving_after_incident_was_taken(self, api, admin, engineer, make_user, employee, report):
        inc = report(employee)
        req = _request(api, engineer, inc["id"]).body["request"]
        api("POST", f"/incidents/{inc['id']}/status", {"status": "closed", "comment": "dup"}, token=employee["token"])
        res = api("POST", f"/assignment-requests/{req['id']}/approve", {}, token=admin["token"])
        assert res.error_code == "REQUEST_NOT_PENDING"          # closing auto-rejected it
        listed = api("GET", "/assignment-requests", token=admin["token"], query={"status": "rejected"}).body
        assert listed["items"][0]["decision_note"] == "The incident was closed"

    def test_listing_is_scoped(self, api, admin, engineer, make_user, employee, report):
        other = make_user("engineer")
        inc = report(employee)
        _request(api, engineer, inc["id"])
        _request(api, other, inc["id"])
        assert len(api("GET", "/assignment-requests", token=admin["token"]).body["items"]) == 2
        assert len(api("GET", "/assignment-requests", token=engineer["token"]).body["items"]) == 1
        assert api("GET", "/assignment-requests", token=employee["token"]).status == 403
        pending = api("GET", "/assignment-requests", token=admin["token"],
                      query={"status": "pending", "incident_id": str(inc["id"])}).body["items"]
        assert len(pending) == 2

    def test_demoting_engineer_withdraws_their_pending_requests(self, api, admin, engineer, employee, report):
        inc = report(employee)
        req = _request(api, engineer, inc["id"]).body["request"]
        assert api("PATCH", f"/users/{engineer['id']}", {"role": "employee"}, token=admin["token"]).status == 200
        listed = api("GET", "/assignment-requests", token=admin["token"]).body["items"]
        assert [(r["id"], r["status"]) for r in listed] == [(req["id"], "withdrawn")]


def test_concurrent_approvals_assign_exactly_one_engineer(  # pylint: disable=too-many-locals
        api, admin, engineer, make_user, employee, report):
    """Two admins approve different engineers' requests at the same moment: one wins."""
    import threading  # pylint: disable=import-outside-toplevel

    from app.core import db  # pylint: disable=import-outside-toplevel
    from app.core.errors import ApiError  # pylint: disable=import-outside-toplevel
    from app.incidents import assignments  # pylint: disable=import-outside-toplevel
    from app.users import repository as users_repo  # pylint: disable=import-outside-toplevel

    second_admin, other = make_user("admin"), make_user("engineer")
    inc = report(employee)
    first = _request(api, engineer, inc["id"]).body["request"]["id"]
    second = _request(api, other, inc["id"]).body["request"]["id"]

    barrier = threading.Barrier(2)
    outcomes = []

    def approve(admin_id, request_id):
        try:
            with db.session_scope() as session:
                actor = users_repo.get_user(session, admin_id)
                barrier.wait()
                assignments.approve(session, actor, request_id, None)
            outcomes.append("ok")
        except ApiError as exc:
            outcomes.append(exc.code)

    threads = [threading.Thread(target=approve, args=(admin["id"], first)),
               threading.Thread(target=approve, args=(second_admin["id"], second))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert sorted(outcomes) == ["REQUEST_NOT_PENDING", "ok"]
    statuses = sorted(r["status"] for r in api("GET", "/assignment-requests", token=admin["token"]).body["items"])
    assert statuses == ["approved", "rejected"]
