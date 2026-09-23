"""Unit tests for the incident workflow and permission rules (no database)."""

from types import SimpleNamespace

import pytest

from app.incidents import workflow

ADMIN = SimpleNamespace(id=1, role="admin")
ENGINEER = SimpleNamespace(id=2, role="engineer")
OTHER_ENGINEER = SimpleNamespace(id=3, role="engineer")
REPORTER = SimpleNamespace(id=4, role="employee")
STRANGER = SimpleNamespace(id=5, role="employee")


def incident(status="open", assignee_id=None, reporter_id=4, is_escalated=False):
    return SimpleNamespace(status=status, assignee_id=assignee_id, reporter_id=reporter_id,
                           is_escalated=is_escalated)


@pytest.mark.parametrize("user,inc,expected", [
    (REPORTER, incident("open"), ["closed"]),
    (ADMIN, incident("open"), ["closed"]),                             # can't start without assignee
    (ADMIN, incident("open", assignee_id=2), ["in_progress", "closed"]),
    (ENGINEER, incident("open", assignee_id=2), ["in_progress"]),
    (OTHER_ENGINEER, incident("open", assignee_id=2), []),
    (ENGINEER, incident("in_progress", assignee_id=2), ["blocked", "resolved"]),
    (ADMIN, incident("in_progress", assignee_id=2), ["blocked", "resolved", "closed"]),
    (ENGINEER, incident("blocked", assignee_id=2), ["in_progress"]),
    (ENGINEER, incident("resolved", assignee_id=2), []),              # resolved = engineer is done
    (REPORTER, incident("resolved", assignee_id=2), []),              # reporter can't reopen
    (ADMIN, incident("resolved", assignee_id=2), ["closed", "in_progress"]),
    (ADMIN, incident("closed", assignee_id=2), []),
])
def test_allowed_transitions(user, inc, expected):
    assert sorted(workflow.allowed_transitions(user, inc)) == sorted(expected)


@pytest.mark.parametrize("user,inc,visible", [
    (ADMIN, incident("closed", assignee_id=9), True),
    (REPORTER, incident("closed"), True),
    (STRANGER, incident("open"), False),
    (ENGINEER, incident("open"), True),                      # open pool
    (ENGINEER, incident("open", assignee_id=3), False),      # someone else's
    (ENGINEER, incident("blocked", assignee_id=2), True),    # own work
    (ENGINEER, incident("in_progress"), False),              # not in the pool
])
def test_can_view(user, inc, visible):
    assert workflow.can_view(user, inc) is visible


def test_every_transition_rule_is_reachable_from_a_real_status():
    statuses = {"open", "in_progress", "blocked", "resolved", "closed"}
    for (frm, to), rule in workflow.TRANSITIONS.items():
        assert frm in statuses and to in statuses and frm != to
        assert rule.allowed


def test_actions_for_reporter_and_admin():
    assert workflow.allowed_actions(REPORTER, incident("open")) == ["edit", "escalate", "add_note"]
    assert workflow.allowed_actions(REPORTER, incident("in_progress", assignee_id=2)) == ["escalate", "add_note"]
    assert workflow.allowed_actions(REPORTER, incident("open", is_escalated=True)) == ["edit", "add_note"]
    assert "request_assignment" in workflow.allowed_actions(ENGINEER, incident("open"))
    assert "request_assignment" not in workflow.allowed_actions(ENGINEER, incident("open", assignee_id=3))
    admin_closed = workflow.allowed_actions(ADMIN, incident("closed", is_escalated=True))
    assert admin_closed == ["delete"]
