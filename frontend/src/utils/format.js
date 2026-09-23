/** Formatting for dates, times and locations shown across the app. */

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "Sep 22, 2026, 3:04 PM" */
export function formatDateTime(value) {
  return value ? dateTime.format(new Date(value)) : ''
}

/** "Sep 22, 2026" */
export function formatDate(value) {
  return value ? dateOnly.format(new Date(value)) : ''
}

/** "3 hours ago", "yesterday", "just now" */
export function timeAgo(value, now = Date.now()) {
  if (!value) return ''
  const seconds = (new Date(value).getTime() - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

/** "HQ Tower · Floor 2 · Seat 2A-03" from an incident's building / floor / seat. */
export function formatLocation({ building, floor, seat }) {
  return [building?.name, floor?.name, seat ? `Seat ${seat.code}` : null].filter(Boolean).join(' · ')
}
