/** API response shapes for tests (matching the backend's Pydantic models). */

const REPORTER = { id: 7, full_name: 'Maria Garcia', email: 'maria.garcia@acme.inc', role: 'employee' }
const ENGINEER = { id: 3, full_name: 'Priya Shah', email: 'priya.shah@acme.inc', role: 'engineer' }
export const PEOPLE = { reporter: REPORTER, engineer: ENGINEER }

export function makeIncident(overrides = {}) {
  return {
    id: 12,
    title: 'Wi-Fi drops every few minutes',
    description: 'Affects the whole first floor.',
    category: 'network',
    priority: 'high',
    status: 'open',
    is_escalated: false,
    building: { id: 2, name: 'Riverside Annex' },
    floor: { id: 5, name: 'Floor 1', level: 1 },
    seat: null,
    reporter: REPORTER,
    assignee: null,
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-21T10:00:00Z',
    escalation_reason: null,
    blocked_reason: null,
    resolution: null,
    close_reason: null,
    acknowledged_at: null,
    assigned_at: null,
    escalated_at: null,
    resolved_at: null,
    closed_at: null,
    allowed_transitions: ['closed'],
    allowed_actions: ['edit', 'escalate', 'add_note'],
    my_assignment_request: null,
    ...overrides,
  }
}

export function makeNote(overrides = {}) {
  return {
    id: 1,
    incident_id: 12,
    body: 'Access point firmware looks outdated.',
    author: ENGINEER,
    created_at: '2026-09-21T10:00:00Z',
    updated_at: '2026-09-21T10:00:00Z',
    ...overrides,
  }
}

export function makeEvent(overrides = {}) {
  return {
    id: 1,
    type: 'created',
    from_value: null,
    to_value: 'open',
    comment: null,
    actor: REPORTER,
    created_at: '2026-09-20T09:00:00Z',
    ...overrides,
  }
}

export function makeSummary(overrides = {}) {
  return {
    scope: 'reported',
    window_days: 30,
    generated_at: '2026-09-22T12:00:00Z',
    totals: {
      total: 7, active: 3, unassigned_open: 1, escalated_active: 1,
      reported_in_window: 7, resolved_in_window: 2, available_pool: null,
    },
    by_status: [],
    by_priority: [],
    by_category: [],
    response_times: {
      acknowledge: { count: 0, avg_hours: null, median_hours: null },
      assign: { count: 0, avg_hours: null, median_hours: null },
      resolve: { count: 0, avg_hours: null, median_hours: null },
    },
    attention: {
      escalated: [{
        id: 6, title: 'Badge reader rejects all badges', status: 'blocked', priority: 'high',
        reason: 'Staff have to walk around', since: '2026-09-20T09:00:00Z', assignee_name: 'Lee Chen',
      }],
      blocked: [{
        id: 6, title: 'Badge reader rejects all badges', status: 'blocked', priority: 'high',
        reason: 'Vendor needs to replace the controller board', since: '2026-09-20T09:00:00Z', assignee_name: 'Lee Chen',
      }],
    },
    trend: [],
    communication: { incidents: 7, with_staff_note: 4, with_staff_note_pct: 57.1, avg_hours_to_first_staff_note: 2.4 },
    workload: null,
    hotspots: null,
    ...overrides,
  }
}

export function listOf(items) {
  return { items, total: items.length, page: 1, page_size: 10 }
}

/** A signed-in engineer (for makeUser overrides). */
export const ENGINEER_USER = {
  id: 3,
  full_name: 'Priya Shah',
  email: 'priya.shah@acme.inc',
  role: 'engineer',
  engineer_profile: { specialties: ['network', 'it_hardware'], availability: 'available', phone: '555-0102' },
}

export function makeRequest(overrides = {}) {
  return {
    id: 40,
    incident: { id: 2, title: 'Projector in Lab won’t turn on', status: 'open', priority: 'medium', category: 'av_equipment' },
    engineer: ENGINEER,
    status: 'pending',
    message: 'I know this model',
    decided_by: null,
    decision_note: null,
    decided_at: null,
    created_at: '2026-09-22T09:00:00Z',
    ...overrides,
  }
}

export const ADMIN_USER = {
  id: 1, full_name: 'Morgan Facilities', email: 'morgan.facilities@acme.inc', role: 'admin', engineer_profile: null,
}

export function makeLoad(overrides = {}) {
  return {
    id: 3, full_name: 'Priya Shah', availability: 'available', specialties: ['network', 'it_hardware'],
    active: 1, open: 0, in_progress: 1, blocked: 0, resolved_in_window: 2, pending_requests: 0,
    ...overrides,
  }
}

export function makeAdminSummary(overrides = {}) {
  return makeSummary({
    scope: 'all',
    totals: {
      total: 22, active: 9, unassigned_open: 4, escalated_active: 2,
      reported_in_window: 21, resolved_in_window: 10, available_pool: null,
    },
    by_status: [
      { key: 'open', count: 4 }, { key: 'in_progress', count: 3 }, { key: 'blocked', count: 2 },
      { key: 'resolved', count: 4 }, { key: 'closed', count: 9 },
    ],
    by_priority: [
      { key: 'critical', count: 2 }, { key: 'high', count: 4 }, { key: 'medium', count: 1 }, { key: 'low', count: 2 },
    ],
    by_category: [{ key: 'hvac', count: 4 }, { key: 'network', count: 3 }, { key: 'plumbing', count: 2 }],
    response_times: {
      acknowledge: { count: 18, avg_hours: 2.1, median_hours: 1 },
      assign: { count: 17, avg_hours: 3.4, median_hours: 2 },
      resolve: { count: 10, avg_hours: 30.2, median_hours: 22 },
    },
    trend: [
      { date: '2026-09-21', reported: 2, resolved: 1 },
      { date: '2026-09-22', reported: 3, resolved: 0 },
    ],
    workload: [
      makeLoad({ id: 2, full_name: 'Sam Rivera', specialties: ['hvac', 'electrical'], active: 3, in_progress: 3, pending_requests: 1 }),
      makeLoad({ id: 4, full_name: 'Lee Chen', availability: 'off_duty', specialties: ['security'], active: 1, blocked: 1, in_progress: 0 }),
    ],
    hotspots: {
      buildings: [{ id: 1, label: 'HQ Tower', count: 13 }, { id: 2, label: 'Riverside Annex', count: 5 }],
      floors: [{ id: 5, label: 'HQ Tower · Ground', count: 6 }],
      seats: [],
    },
    communication: { incidents: 21, with_staff_note: 9, with_staff_note_pct: 42.9, avg_hours_to_first_staff_note: 3.2 },
    ...overrides,
  })
}
