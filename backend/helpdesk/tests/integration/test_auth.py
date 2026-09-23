"""Integration tests for /auth endpoints."""

import time

import jwt
import pytest

from app.core import config

pytestmark = pytest.mark.integration


class TestRegister:
    def test_creates_employee_and_returns_tokens(self, api):
        res = api("POST", "/auth/register", {
            "email": "  Jane.Doe@ACME.inc ", "full_name": "Jane Doe", "password": "Password123",
        })
        assert res.status == 201
        assert res.body["user"]["email"] == "jane.doe@acme.inc"
        assert res.body["user"]["role"] == "employee"
        assert "password_hash" not in res.body["user"]
        assert "token_version" not in res.body["user"]
        assert res.body["tokens"]["access_token"]
        assert res.body["tokens"]["refresh_token"]

    def test_cannot_self_register_as_admin(self, api):
        res = api("POST", "/auth/register", {
            "email": "x@acme.inc", "full_name": "X", "password": "Password123", "role": "admin",
        })
        assert res.status == 400
        assert res.body["error"]["fields"] == {"role": "Unknown field"}

    @pytest.mark.parametrize("email", ["jane@gmail.com", "jane@acme.inc.evil.com", "jane", "@acme.inc"])
    def test_rejects_non_acme_email(self, api, email):
        res = api("POST", "/auth/register", {"email": email, "full_name": "J", "password": "Password123"})
        assert res.status == 400
        assert "email" in res.body["error"]["fields"]

    @pytest.mark.parametrize("password,reason", [
        ("short1", "at least"),
        ("longpassword", "letter and one number"),
        ("1234567890", "letter and one number"),
    ])
    def test_rejects_weak_password(self, api, password, reason):
        res = api("POST", "/auth/register", {"email": "a@acme.inc", "full_name": "A", "password": password})
        assert res.status == 400
        assert reason in res.body["error"]["fields"]["password"]

    def test_reports_all_missing_fields(self, api):
        res = api("POST", "/auth/register", {})
        assert res.status == 400
        assert set(res.body["error"]["fields"]) == {"email", "full_name", "password"}

    def test_duplicate_email_conflicts(self, api, employee):
        res = api("POST", "/auth/register", {
            "email": employee["email"].upper(), "full_name": "Dup", "password": "Password123",
        })
        assert res.status == 409
        assert res.error_code == "EMAIL_TAKEN"

    def test_malformed_json(self, api):
        res = api("POST", "/auth/register", raw_body="{not json")
        assert res.status == 400
        assert res.error_code == "INVALID_JSON"

    def test_non_object_json(self, api):
        res = api("POST", "/auth/register", raw_body="[1, 2]")
        assert res.status == 400
        assert res.error_code == "INVALID_JSON"


class TestLogin:
    def test_success(self, api, employee):
        res = api("POST", "/auth/login", {"email": employee["email"], "password": employee["password"]})
        assert res.status == 200
        assert res.body["user"]["id"] == employee["id"]
        assert res.body["user"]["last_login_at"] is not None

    def test_email_is_case_insensitive(self, api, employee):
        res = api("POST", "/auth/login", {"email": employee["email"].upper(), "password": employee["password"]})
        assert res.status == 200

    def test_wrong_password(self, api, employee):
        res = api("POST", "/auth/login", {"email": employee["email"], "password": "WrongPass123"})
        assert res.status == 401
        assert res.error_code == "INVALID_CREDENTIALS"

    def test_unknown_email_gives_same_error(self, api):
        res = api("POST", "/auth/login", {"email": "nobody@acme.inc", "password": "Password123"})
        assert res.status == 401
        assert res.error_code == "INVALID_CREDENTIALS"

    def test_disabled_account(self, api, make_user):
        user = make_user(is_active=False)
        res = api("POST", "/auth/login", {"email": user["email"], "password": user["password"]})
        assert res.status == 403
        assert res.error_code == "ACCOUNT_DISABLED"

    def test_bootstrap_admin_must_change_password(self, api):
        res = api("POST", "/auth/login", {"email": "admin@acme.inc", "password": "Bootstrap123"})
        assert res.status == 200
        assert res.body["user"]["role"] == "admin"
        assert res.body["user"]["must_change_password"] is True


class TestTokens:
    def test_me_requires_token(self, api):
        res = api("GET", "/auth/me")
        assert res.status == 401
        assert res.error_code == "MISSING_TOKEN"

    def test_me_with_token(self, api, employee):
        res = api("GET", "/auth/me", token=employee["token"])
        assert res.status == 200
        assert res.body["user"]["email"] == employee["email"]

    def test_prefixed_path_is_supported(self, api, employee):
        res = api("GET", "/api/helpdesk/auth/me", token=employee["token"])
        assert res.status == 200

    def test_garbage_token(self, api):
        res = api("GET", "/auth/me", token="not-a-jwt")
        assert res.status == 401
        assert res.error_code == "INVALID_TOKEN"

    def test_token_signed_with_other_key(self, api, employee):
        forged = jwt.encode({"sub": str(employee["id"]), "type": "access", "ver": 0,
                             "exp": int(time.time()) + 60}, "other-key", algorithm="HS256")
        res = api("GET", "/auth/me", token=forged)
        assert res.status == 401

    def test_expired_token(self, api, employee):
        expired = jwt.encode({"sub": str(employee["id"]), "type": "access", "ver": 0,
                              "exp": int(time.time()) - 10}, config.jwt_secret(), algorithm="HS256")
        res = api("GET", "/auth/me", token=expired)
        assert res.status == 401
        assert res.error_code == "TOKEN_EXPIRED"

    def test_refresh_token_cannot_be_used_as_access_token(self, api, employee):
        login = api("POST", "/auth/login", {"email": employee["email"], "password": employee["password"]})
        res = api("GET", "/auth/me", token=login.body["tokens"]["refresh_token"])
        assert res.status == 401

    def test_refresh(self, api, employee):
        login = api("POST", "/auth/login", {"email": employee["email"], "password": employee["password"]})
        res = api("POST", "/auth/refresh", {"refresh_token": login.body["tokens"]["refresh_token"]})
        assert res.status == 200
        assert api("GET", "/auth/me", token=res.body["tokens"]["access_token"]).status == 200

    def test_refresh_rejects_access_token(self, api, employee):
        res = api("POST", "/auth/refresh", {"refresh_token": employee["token"]})
        assert res.status == 401

    def test_deactivated_user_token_rejected(self, api, admin, employee):
        assert api("PATCH", f"/users/{employee['id']}", {"is_active": False}, token=admin["token"]).status == 200
        res = api("GET", "/auth/me", token=employee["token"])
        assert res.status == 401
        assert res.error_code == "ACCOUNT_DISABLED"


class TestChangePassword:
    def test_success_revokes_old_tokens(self, api, employee):
        res = api("PUT", "/auth/password", {
            "current_password": employee["password"], "new_password": "NewPassword456",
        }, token=employee["token"])
        assert res.status == 200
        assert api("GET", "/auth/me", token=employee["token"]).error_code == "SESSION_REVOKED"
        assert api("GET", "/auth/me", token=res.body["tokens"]["access_token"]).status == 200
        login = api("POST", "/auth/login", {"email": employee["email"], "password": "NewPassword456"})
        assert login.status == 200

    def test_wrong_current_password(self, api, employee):
        res = api("PUT", "/auth/password", {
            "current_password": "Nope12345678", "new_password": "NewPassword456",
        }, token=employee["token"])
        assert res.status == 400
        assert "current_password" in res.body["error"]["fields"]

    def test_new_password_must_differ(self, api, employee):
        res = api("PUT", "/auth/password", {
            "current_password": employee["password"], "new_password": employee["password"],
        }, token=employee["token"])
        assert res.status == 400
        assert "new_password" in res.body["error"]["fields"]

    def test_policy_applies(self, api, employee):
        res = api("PUT", "/auth/password", {
            "current_password": employee["password"], "new_password": "weak",
        }, token=employee["token"])
        assert res.status == 400

    def test_pending_change_blocks_other_routes_until_changed(self, api, make_user):
        user = make_user("admin", must_change_password=True)
        blocked = api("GET", "/users", token=user["token"])
        assert blocked.status == 403
        assert blocked.error_code == "PASSWORD_CHANGE_REQUIRED"
        assert api("GET", "/auth/me", token=user["token"]).status == 200

        changed = api("PUT", "/auth/password", {
            "current_password": user["password"], "new_password": "Fresh123456",
        }, token=user["token"])
        assert changed.status == 200
        assert changed.body["user"]["must_change_password"] is False
        assert api("GET", "/users", token=changed.body["tokens"]["access_token"]).status == 200


class TestRouting:
    def test_unknown_route(self, api):
        res = api("GET", "/nope")
        assert res.status == 404
        assert res.error_code == "NOT_FOUND"

    def test_wrong_method(self, api):
        res = api("DELETE", "/auth/login")
        assert res.status == 405

    def test_cors_preflight_locally(self, api):
        res = api("OPTIONS", "/users", headers={
            "origin": "http://localhost:3000", "access-control-request-method": "GET",
        })
        assert res.status == 200
        assert res.headers["access-control-allow-origin"] == "*"

    def test_health(self, api):
        assert api("GET", "/health").body == {"status": "ok"}
