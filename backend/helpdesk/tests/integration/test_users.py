"""Integration tests for /users endpoints and admin invariants."""

import threading

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core import db
from app.core.errors import ApiError
from app.users import repository as users_repo
from app.users import service as users_service
from app.users.models import User

pytestmark = pytest.mark.integration


class TestAccessControl:
    @pytest.mark.parametrize("role", ["employee", "engineer"])
    def test_non_admins_cannot_list(self, api, make_user, role):
        res = api("GET", "/users", token=make_user(role)["token"])
        assert res.status == 403
        assert res.error_code == "FORBIDDEN"

    def test_non_admin_cannot_view_others(self, api, employee, engineer):
        assert api("GET", f"/users/{engineer['id']}", token=employee["token"]).status == 403

    def test_user_can_view_self(self, api, engineer):
        res = api("GET", f"/users/{engineer['id']}", token=engineer["token"])
        assert res.status == 200
        assert res.body["user"]["engineer_profile"]["specialties"] == ["hvac"]

    @pytest.mark.parametrize("method,path", [
        ("POST", "/users"), ("DELETE", "/users/1"), ("POST", "/users/1/reset-password"),
    ])
    def test_admin_only_actions(self, api, employee, method, path):
        assert api(method, path, {}, token=employee["token"]).status == 403

    def test_unknown_user(self, api, admin):
        assert api("GET", "/users/99999", token=admin["token"]).status == 404


class TestList:
    def test_search_and_filters(self, api, admin, make_user):
        make_user("engineer", full_name="Grace Hopper")
        make_user("employee", full_name="Alan Turing")
        make_user("employee", full_name="Ada Lovelace", is_active=False)

        res = api("GET", "/users", token=admin["token"], query={"q": "grace"})
        assert [u["full_name"] for u in res.body["items"]] == ["Grace Hopper"]

        res = api("GET", "/users", token=admin["token"], query={"role": "employee"})
        assert {u["full_name"] for u in res.body["items"]} == {"Alan Turing", "Ada Lovelace"}

        res = api("GET", "/users", token=admin["token"], query={"role": "employee", "is_active": "false"})
        assert [u["full_name"] for u in res.body["items"]] == ["Ada Lovelace"]

    def test_pagination(self, api, admin, make_user):
        for _ in range(5):
            make_user()
        res = api("GET", "/users", token=admin["token"], query={"page": "2", "page_size": "3"})
        assert res.status == 200
        assert res.body["total"] == 7  # 5 + admin fixture + bootstrap admin
        assert len(res.body["items"]) == 3
        assert res.body["page"] == 2

    @pytest.mark.parametrize("query", [{"role": "boss"}, {"page": "0"}, {"page_size": "abc"}, {"is_active": "maybe"}])
    def test_invalid_query(self, api, admin, query):
        assert api("GET", "/users", token=admin["token"], query=query).status == 400


class TestCreate:
    def test_create_engineer_with_profile(self, api, admin):
        res = api("POST", "/users", {
            "email": "Eng@acme.inc", "full_name": "New Engineer", "role": "engineer",
            "engineer_profile": {"specialties": ["hvac", "electrical", "hvac"], "phone": "555-0100"},
        }, token=admin["token"])
        assert res.status == 201
        user = res.body["user"]
        assert user["email"] == "eng@acme.inc"
        assert user["must_change_password"] is True
        assert user["engineer_profile"] == {
            "specialties": ["hvac", "electrical"], "availability": "available", "phone": "555-0100",
        }
        login = api("POST", "/auth/login", {"email": "eng@acme.inc", "password": res.body["temporary_password"]})
        assert login.status == 200

    def test_engineer_availability_defaults_to_available(self, api, admin):
        res = api("POST", "/users", {
            "email": "e2@acme.inc", "full_name": "E", "role": "engineer",
            "engineer_profile": {"specialties": ["plumbing"]},
        }, token=admin["token"])
        assert res.status == 201
        assert res.body["user"]["engineer_profile"]["availability"] == "available"

    @pytest.mark.parametrize("profile", [None, {}, {"phone": "1"}, {"specialties": []}])
    def test_engineer_requires_a_specialty(self, api, admin, profile):
        payload = {"email": "e3@acme.inc", "full_name": "E", "role": "engineer"}
        if profile is not None:
            payload["engineer_profile"] = profile
        res = api("POST", "/users", payload, token=admin["token"])
        assert res.status == 400
        assert res.body["error"]["fields"] == {
            "engineer_profile.specialties": "Choose at least one specialty for an engineer",
        }
        assert api("GET", "/users", token=admin["token"], query={"q": "e3@"}).body["total"] == 0

    def test_profile_only_for_engineers(self, api, admin):
        res = api("POST", "/users", {
            "email": "x@acme.inc", "full_name": "X", "role": "employee",
            "engineer_profile": {"phone": "1"},
        }, token=admin["token"])
        assert res.status == 400
        assert "engineer_profile" in res.body["error"]["fields"]

    def test_validation_errors(self, api, admin):
        res = api("POST", "/users", {
            "email": "x@gmail.com", "role": "wizard", "extra": 1,
            "engineer_profile": {"specialties": ["magic"], "availability": "sometimes"},
        }, token=admin["token"])
        assert res.status == 400
        assert set(res.body["error"]["fields"]) == {
            "email", "full_name", "role", "extra",
            "engineer_profile.specialties", "engineer_profile.availability",
        }

    def test_duplicate_email(self, api, admin, employee):
        res = api("POST", "/users", {"email": employee["email"], "full_name": "D", "role": "employee"},
                  token=admin["token"])
        assert res.status == 409


class TestUpdate:
    def test_admin_edits_user(self, api, admin, employee):
        res = api("PATCH", f"/users/{employee['id']}", {
            "full_name": "Renamed", "email": "renamed@acme.inc",
        }, token=admin["token"])
        assert res.status == 200
        assert res.body["user"]["full_name"] == "Renamed"
        assert res.body["user"]["email"] == "renamed@acme.inc"

    def test_email_conflict(self, api, admin, employee, engineer):
        res = api("PATCH", f"/users/{employee['id']}", {"email": engineer["email"]}, token=admin["token"])
        assert res.status == 409

    def test_promote_to_engineer_creates_profile_and_demote_removes_it(self, api, admin, employee):
        res = api("PATCH", f"/users/{employee['id']}", {
            "role": "engineer", "engineer_profile": {"specialties": ["network"]},
        }, token=admin["token"])
        assert res.body["user"]["engineer_profile"]["specialties"] == ["network"]
        res = api("PATCH", f"/users/{employee['id']}", {"role": "employee"}, token=admin["token"])
        assert res.body["user"]["engineer_profile"] is None

    def test_promotion_to_engineer_requires_a_specialty(self, api, admin, employee):
        res = api("PATCH", f"/users/{employee['id']}", {"role": "engineer"}, token=admin["token"])
        assert res.status == 400
        assert "engineer_profile.specialties" in res.body["error"]["fields"]
        user = api("GET", f"/users/{employee['id']}", token=admin["token"]).body["user"]
        assert user["role"] == "employee"

    def test_engineer_can_have_many_specialties(self, api, admin, engineer):
        res = api("PATCH", f"/users/{engineer['id']}", {
            "engineer_profile": {"specialties": ["network", "it_hardware", "av_equipment"]},
        }, token=admin["token"])
        assert res.status == 200
        assert res.body["user"]["engineer_profile"]["specialties"] == ["network", "it_hardware", "av_equipment"]

    def test_cannot_clear_engineer_specialties(self, api, admin, engineer):
        res = api("PATCH", f"/users/{engineer['id']}", {"engineer_profile": {"specialties": []}},
                  token=admin["token"])
        assert res.status == 400
        assert "engineer_profile.specialties" in res.body["error"]["fields"]

    def test_repromoted_engineer_must_choose_specialties_again(self, api, admin, engineer):
        assert api("PATCH", f"/users/{engineer['id']}", {"role": "employee"}, token=admin["token"]).status == 200
        res = api("PATCH", f"/users/{engineer['id']}", {"role": "engineer"}, token=admin["token"])
        assert res.status == 400

    def test_database_rejects_engineer_without_specialties(self, engineer):
        with pytest.raises(IntegrityError):
            with db.session_scope() as session:
                session.execute(text("UPDATE engineer_profiles SET specialties = '{}'"))

    def test_profile_rejected_for_non_engineer(self, api, admin, employee):
        res = api("PATCH", f"/users/{employee['id']}", {"engineer_profile": {"phone": "1"}},
                  token=admin["token"])
        assert res.status == 400

    def test_user_edits_own_name(self, api, employee):
        res = api("PATCH", f"/users/{employee['id']}", {"full_name": "Me"}, token=employee["token"])
        assert res.status == 200
        assert res.body["user"]["full_name"] == "Me"

    @pytest.mark.parametrize("field,value", [("role", "admin"), ("email", "new@acme.inc"), ("is_active", True)])
    def test_user_cannot_edit_admin_fields(self, api, employee, field, value):
        res = api("PATCH", f"/users/{employee['id']}", {field: value}, token=employee["token"])
        assert res.status == 403
        assert res.error_code == "FORBIDDEN_FIELD"

    def test_user_cannot_edit_others(self, api, employee, engineer):
        res = api("PATCH", f"/users/{engineer['id']}", {"full_name": "X"}, token=employee["token"])
        assert res.status == 403

    def test_engineer_updates_own_availability(self, api, engineer):
        res = api("PATCH", f"/users/{engineer['id']}", {
            "engineer_profile": {"availability": "busy", "phone": ""},
        }, token=engineer["token"])
        assert res.status == 200
        assert res.body["user"]["engineer_profile"]["availability"] == "busy"
        assert res.body["user"]["engineer_profile"]["phone"] is None

    def test_engineer_cannot_change_own_specialties(self, api, engineer):
        res = api("PATCH", f"/users/{engineer['id']}", {
            "engineer_profile": {"specialties": ["plumbing"]},
        }, token=engineer["token"])
        assert res.status == 400

    def test_employee_has_no_profile_to_edit(self, api, employee):
        res = api("PATCH", f"/users/{employee['id']}", {"engineer_profile": {"availability": "busy"}},
                  token=employee["token"])
        assert res.status == 400


class TestAdminSafety:
    def test_admin_cannot_change_own_role(self, api, admin):
        res = api("PATCH", f"/users/{admin['id']}", {"role": "employee"}, token=admin["token"])
        assert res.status == 403
        assert res.error_code == "CANNOT_MODIFY_SELF"

    def test_admin_cannot_deactivate_self(self, api, admin):
        res = api("PATCH", f"/users/{admin['id']}", {"is_active": False}, token=admin["token"])
        assert res.status == 403
        assert res.error_code == "CANNOT_MODIFY_SELF"

    def test_admin_can_resend_own_unchanged_role(self, api, admin):
        res = api("PATCH", f"/users/{admin['id']}", {"role": "admin", "full_name": "Boss"}, token=admin["token"])
        assert res.status == 200

    def test_admin_cannot_delete_self(self, api, admin):
        res = api("DELETE", f"/users/{admin['id']}", token=admin["token"])
        assert res.status == 403
        assert res.error_code == "CANNOT_MODIFY_SELF"

    def test_admin_can_remove_another_admin(self, api, admin):
        res = api("PATCH", "/users/1", {"role": "employee"}, token=admin["token"])  # bootstrap admin
        assert res.status == 200

    def test_demoted_admin_loses_access_immediately(self, api, admin, make_user):
        other = make_user("admin")
        assert api("PATCH", f"/users/{other['id']}", {"role": "employee"}, token=admin["token"]).status == 200
        assert api("GET", "/users", token=other["token"]).status == 403

    def test_last_admin_rule(self):
        with pytest.raises(ApiError) as exc:
            users_service._ensure_admin_remains([5], User(id=5))  # pylint: disable=protected-access
        assert exc.value.code == "LAST_ADMIN"
        users_service._ensure_admin_remains([5, 6], User(id=5))  # pylint: disable=protected-access

    def test_concurrent_mutual_demotion_leaves_one_admin(self, admin, make_user):
        """Two admins demote each other at the same time: exactly one succeeds."""
        other = make_user("admin")
        with db.session_scope() as session:  # only `admin` and `other` remain admins
            session.execute(text("UPDATE users SET role = 'employee' WHERE id = 1"))

        barrier = threading.Barrier(2)
        outcomes = {}

        def demote(actor_id, target_id, key):
            try:
                with db.session_scope() as session:
                    actor = users_repo.get_user(session, actor_id)
                    barrier.wait()
                    users_service.update_user(session, actor, target_id, {"role": "employee"}, None)
                outcomes[key] = "ok"
            except ApiError as exc:
                outcomes[key] = exc.code

        threads = [
            threading.Thread(target=demote, args=(admin["id"], other["id"], "a")),
            threading.Thread(target=demote, args=(other["id"], admin["id"], "b")),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert sorted(outcomes.values()) == ["FORBIDDEN", "ok"]
        with db.session_scope() as session:
            admins = session.scalar(text("SELECT count(*) FROM users WHERE role = 'admin' AND is_active"))
        assert admins == 1


class TestDelete:
    def test_delete_user(self, api, admin, employee):
        assert api("DELETE", f"/users/{employee['id']}", token=admin["token"]).status == 204
        assert api("GET", f"/users/{employee['id']}", token=admin["token"]).status == 404

    def test_delete_missing(self, api, admin):
        assert api("DELETE", "/users/99999", token=admin["token"]).status == 404


class TestResetPassword:
    def test_reset_flow(self, api, admin, employee):
        res = api("POST", f"/users/{employee['id']}/reset-password", token=admin["token"])
        assert res.status == 200
        temp = res.body["temporary_password"]

        assert api("GET", "/auth/me", token=employee["token"]).error_code == "SESSION_REVOKED"
        assert api("POST", "/auth/login", {"email": employee["email"], "password": employee["password"]}).status == 401

        login = api("POST", "/auth/login", {"email": employee["email"], "password": temp})
        assert login.status == 200
        assert login.body["user"]["must_change_password"] is True

    def test_admin_cannot_reset_own_password(self, api, admin):
        res = api("POST", f"/users/{admin['id']}/reset-password", token=admin["token"])
        assert res.status == 400
