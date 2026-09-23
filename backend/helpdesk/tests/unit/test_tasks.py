"""Unit tests for Lambda task routing (no database needed)."""

import function
from app import tasks


def test_task_events_are_told_apart_from_http_events():
    assert tasks.is_task_event({"task": "seed_demo_data"})
    # Function URL / API Gateway events always carry requestContext, even with a "task" field
    assert not tasks.is_task_event({"task": "seed_demo_data", "requestContext": {"http": {}}})
    assert not tasks.is_task_event({"version": "2.0", "rawPath": "/health", "requestContext": {}})
    assert not tasks.is_task_event("seed_demo_data")


def test_handler_routes_tasks_and_http(monkeypatch):
    calls = []
    monkeypatch.setattr(function, "run_task", lambda event: calls.append(("task", event)) or {"ok": True})
    monkeypatch.setattr(function, "_http", lambda event, context: calls.append(("http", event)) or {"statusCode": 200})

    assert function.handler({"task": "seed_demo_data"}, None) == {"ok": True}
    assert function.handler({"requestContext": {}, "rawPath": "/health"}, None) == {"statusCode": 200}
    assert [kind for kind, _ in calls] == ["task", "http"]


def test_unknown_task_is_reported():
    result = tasks.run_task({"task": "drop_everything"})
    assert result["ok"] is False
    assert "seed_demo_data" in result["error"]


def test_task_errors_are_reported_not_raised(monkeypatch):
    def boom(_event):
        raise RuntimeError("database unavailable")

    monkeypatch.setitem(tasks.TASKS, "seed_demo_data", boom)
    assert tasks.run_task({"task": "seed_demo_data"}) == {"ok": False, "error": "RuntimeError: database unavailable"}


def test_seed_task_rejects_weak_or_invalid_passwords():
    assert tasks.run_task({"task": "seed_demo_data", "password": "short"})["ok"] is False
    assert tasks.run_task({"task": "seed_demo_data", "password": 12345678901})["error"] == "password: must be a string"
