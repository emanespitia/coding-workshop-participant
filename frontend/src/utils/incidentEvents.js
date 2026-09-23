import { PRIORITY_LABELS, STATUS_LABELS } from '../constants/incidents'

const status = (value) => STATUS_LABELS[value] ?? value
const priority = (value) => (PRIORITY_LABELS[value] ?? value).toLowerCase()

/** One history entry as a sentence fragment that follows the actor's name. */
export function describeEvent(event) {
  const { type, from_value: from, to_value: to } = event
  switch (type) {
    case 'created':
      return 'reported the incident'
    case 'status_changed':
      return `moved it from ${status(from)} to ${status(to)}`
    case 'assigned':
      return from ? `reassigned it from ${from} to ${to}` : `assigned it to ${to}`
    case 'unassigned':
      return `unassigned ${from}`
    case 'priority_changed':
      return `changed the priority from ${priority(from)} to ${priority(to)}`
    case 'escalated':
      return 'escalated it'
    case 'deescalated':
      return 'removed the escalation'
    case 'assignment_requested':
      return 'asked to take this incident'
    case 'assignment_rejected':
      return `turned down ${to}'s request to take it`
    case 'updated':
      return 'edited the details'
    default:
      return type.replaceAll('_', ' ')
  }
}
