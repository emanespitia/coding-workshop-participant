"""Integration tests for buildings, floors and seats."""

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
def building(api, admin):
    """A building with two floors; the first floor has two seats."""
    b = api("POST", "/buildings", {"name": "HQ", "address": "1 Main St"}, token=admin["token"]).body["building"]
    f1 = api("POST", f"/buildings/{b['id']}/floors", {"name": "Ground", "level": 0},
             token=admin["token"]).body["floor"]
    f2 = api("POST", f"/buildings/{b['id']}/floors", {"name": "Basement", "level": -1},
             token=admin["token"]).body["floor"]
    s1 = api("POST", f"/floors/{f1['id']}/seats", {"code": "G-02"}, token=admin["token"]).body["seat"]
    s2 = api("POST", f"/floors/{f1['id']}/seats", {"code": "G-01"}, token=admin["token"]).body["seat"]
    return {"building": b, "floors": [f1, f2], "seats": [s1, s2]}


class TestAccess:
    @pytest.mark.parametrize("role", ["employee", "engineer", "admin"])
    def test_everyone_signed_in_can_read(self, api, make_user, building, role):
        token = make_user(role)["token"]
        b_id, f_id = building["building"]["id"], building["floors"][0]["id"]
        for path in ("/buildings", f"/buildings/{b_id}", f"/buildings/{b_id}/floors",
                     f"/floors/{f_id}", f"/floors/{f_id}/seats", f"/seats/{building['seats'][0]['id']}"):
            assert api("GET", path, token=token).status == 200, path

    def test_anonymous_cannot_read(self, api):
        assert api("GET", "/buildings").status == 401

    @pytest.mark.parametrize("role", ["employee", "engineer"])
    def test_only_admins_can_write(self, api, make_user, building, role):
        token = make_user(role)["token"]
        b_id, f_id, s_id = building["building"]["id"], building["floors"][0]["id"], building["seats"][0]["id"]
        calls = [
            ("POST", "/buildings", {"name": "X"}),
            ("PATCH", f"/buildings/{b_id}", {"name": "X"}),
            ("DELETE", f"/buildings/{b_id}", None),
            ("POST", f"/buildings/{b_id}/floors", {"name": "X", "level": 1}),
            ("PATCH", f"/floors/{f_id}", {"name": "X"}),
            ("DELETE", f"/floors/{f_id}", None),
            ("POST", f"/floors/{f_id}/seats", {"code": "X"}),
            ("PATCH", f"/seats/{s_id}", {"code": "X"}),
            ("DELETE", f"/seats/{s_id}", None),
        ]
        for method, path, body in calls:
            assert api(method, path, body, token=token).status == 403, (method, path)


class TestBuildings:
    def test_create_and_detail(self, api, admin, building):
        res = api("GET", f"/buildings/{building['building']['id']}", token=admin["token"])
        b = res.body["building"]
        assert b["name"] == "HQ"
        assert b["address"] == "1 Main St"
        assert b["floor_count"] == 2
        # floors ordered by level, each with its seat count
        assert [(f["name"], f["seat_count"]) for f in b["floors"]] == [("Basement", 0), ("Ground", 2)]

    def test_list_and_search(self, api, admin, building):
        api("POST", "/buildings", {"name": "Annex", "address": "9 Side Rd"}, token=admin["token"])
        names = [b["name"] for b in api("GET", "/buildings", token=admin["token"]).body["items"]]
        assert names == ["Annex", "HQ"]
        by_address = api("GET", "/buildings", token=admin["token"], query={"q": "main"}).body["items"]
        assert [b["name"] for b in by_address] == ["HQ"]

    def test_duplicate_name_is_case_insensitive(self, api, admin, building):
        res = api("POST", "/buildings", {"name": "  hq "}, token=admin["token"])
        assert res.status == 409
        assert res.body["error"]["fields"] == {"name": "Already in use"}

    def test_rename_and_clear_address(self, api, admin, building):
        b_id = building["building"]["id"]
        res = api("PATCH", f"/buildings/{b_id}", {"name": "Headquarters", "address": ""}, token=admin["token"])
        assert res.status == 200
        assert res.body["building"]["name"] == "Headquarters"
        assert res.body["building"]["address"] is None

    def test_rename_to_existing_name(self, api, admin, building):
        other = api("POST", "/buildings", {"name": "Annex"}, token=admin["token"]).body["building"]
        res = api("PATCH", f"/buildings/{other['id']}", {"name": "HQ"}, token=admin["token"])
        assert res.status == 409

    @pytest.mark.parametrize("body,field", [
        ({}, "name"), ({"name": "   "}, "name"), ({"name": "x" * 121}, "name"),
        ({"name": "A", "floors": 3}, "floors"),
    ])
    def test_validation(self, api, admin, body, field):
        res = api("POST", "/buildings", body, token=admin["token"])
        assert res.status == 400
        assert field in res.body["error"]["fields"]

    def test_patch_rejects_null_name(self, api, admin, building):
        res = api("PATCH", f"/buildings/{building['building']['id']}", {"name": None}, token=admin["token"])
        assert res.status == 400

    def test_delete_cascades_to_floors_and_seats(self, api, admin, building):
        b_id, f_id, s_id = building["building"]["id"], building["floors"][0]["id"], building["seats"][0]["id"]
        assert api("DELETE", f"/buildings/{b_id}", token=admin["token"]).status == 204
        assert api("GET", f"/buildings/{b_id}", token=admin["token"]).status == 404
        assert api("GET", f"/floors/{f_id}", token=admin["token"]).status == 404
        assert api("GET", f"/seats/{s_id}", token=admin["token"]).status == 404

    def test_missing_building(self, api, admin):
        for method, path, body in (
            ("GET", "/buildings/999", None),
            ("PATCH", "/buildings/999", {"name": "B"}),
            ("DELETE", "/buildings/999", None),
            ("GET", "/buildings/999/floors", None),
            ("POST", "/buildings/999/floors", {"name": "F", "level": 1}),
        ):
            assert api(method, path, body, token=admin["token"]).status == 404, (method, path)


class TestFloors:
    def test_list_ordered_by_level(self, api, admin, building):
        res = api("GET", f"/buildings/{building['building']['id']}/floors", token=admin["token"])
        assert [f["level"] for f in res.body["items"]] == [-1, 0]

    def test_duplicate_name_within_building(self, api, admin, building):
        res = api("POST", f"/buildings/{building['building']['id']}/floors", {"name": "ground", "level": 5},
                  token=admin["token"])
        assert res.status == 409

    def test_same_name_in_another_building(self, api, admin, building):
        other = api("POST", "/buildings", {"name": "Annex"}, token=admin["token"]).body["building"]
        res = api("POST", f"/buildings/{other['id']}/floors", {"name": "Ground", "level": 0},
                  token=admin["token"])
        assert res.status == 201

    def test_update(self, api, admin, building):
        f_id = building["floors"][1]["id"]
        res = api("PATCH", f"/floors/{f_id}", {"name": "Lower Ground", "level": -2}, token=admin["token"])
        assert res.status == 200
        assert (res.body["floor"]["name"], res.body["floor"]["level"]) == ("Lower Ground", -2)

    @pytest.mark.parametrize("body,field", [
        ({"name": "F"}, "level"), ({"level": 1}, "name"), ({"name": "F", "level": "high"}, "level"),
        ({"name": "F", "level": 1000}, "level"),
    ])
    def test_validation(self, api, admin, building, body, field):
        res = api("POST", f"/buildings/{building['building']['id']}/floors", body, token=admin["token"])
        assert res.status == 400
        assert field in res.body["error"]["fields"]

    def test_delete_cascades_to_seats(self, api, admin, building):
        f_id, s_id = building["floors"][0]["id"], building["seats"][0]["id"]
        assert api("DELETE", f"/floors/{f_id}", token=admin["token"]).status == 204
        assert api("GET", f"/seats/{s_id}", token=admin["token"]).status == 404
        detail = api("GET", f"/buildings/{building['building']['id']}", token=admin["token"]).body["building"]
        assert detail["floor_count"] == 1


class TestSeats:
    def test_list_ordered_and_searchable(self, api, admin, building):
        f_id = building["floors"][0]["id"]
        codes = [s["code"] for s in api("GET", f"/floors/{f_id}/seats", token=admin["token"]).body["items"]]
        assert codes == ["G-01", "G-02"]
        found = api("GET", f"/floors/{f_id}/seats", token=admin["token"], query={"q": "g-02"}).body["items"]
        assert [s["code"] for s in found] == ["G-02"]

    def test_duplicate_code_on_same_floor(self, api, admin, building):
        res = api("POST", f"/floors/{building['floors'][0]['id']}/seats", {"code": "g-01"}, token=admin["token"])
        assert res.status == 409
        assert res.error_code == "DUPLICATE_CODE"

    def test_update_and_delete(self, api, admin, building):
        s_id = building["seats"][0]["id"]
        res = api("PATCH", f"/seats/{s_id}", {"code": "G-99"}, token=admin["token"])
        assert res.body["seat"]["code"] == "G-99"
        assert api("DELETE", f"/seats/{s_id}", token=admin["token"]).status == 204
        assert api("GET", f"/seats/{s_id}", token=admin["token"]).status == 404

    def test_rename_to_existing_code(self, api, admin, building):
        res = api("PATCH", f"/seats/{building['seats'][0]['id']}", {"code": "G-01"}, token=admin["token"])
        assert res.status == 409

    def test_missing_floor(self, api, admin):
        assert api("GET", "/floors/999/seats", token=admin["token"]).status == 404
        assert api("POST", "/floors/999/seats", {"code": "A"}, token=admin["token"]).status == 404
