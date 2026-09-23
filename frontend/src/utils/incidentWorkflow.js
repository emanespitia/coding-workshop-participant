import { formatDateTime } from './format'

/**
 * Where the incident is in the workflow: Reported → In progress → Resolved → Closed.
 * Blocked shows as a problem on the In progress step. An incident closed without being
 * resolved (cancelled, or closed by an admin) shows Reported → Closed.
 */
export function workflowSteps(incident) {
  const { status } = incident
  const reported = { label: 'Reported', caption: formatDateTime(incident.created_at) }
  const closed = { label: 'Closed', caption: formatDateTime(incident.closed_at) }

  if (status === 'closed' && !incident.resolved_at) {
    return { steps: [reported, closed], active: 2 }
  }

  const waiting = incident.assignee ? `Assigned to ${incident.assignee.full_name}` : 'Waiting for an engineer'
  const inProgress = status === 'blocked'
    ? { label: 'Blocked', caption: incident.blocked_reason, error: true }
    : { label: 'In progress', caption: status === 'open' ? waiting : incident.assignee?.full_name }
  const resolved = { label: 'Resolved', caption: formatDateTime(incident.resolved_at) }
  // `active` = the current step; steps before it are complete.
  const active = { open: 1, in_progress: 1, blocked: 1, resolved: 3, closed: 4 }[status]
  return { steps: [reported, inProgress, resolved, closed], active }
}
