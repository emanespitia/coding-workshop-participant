const AVAILABILITY_RANK = { available: 0, busy: 1, off_duty: 2 }

/**
 * Engineers best suited first: they asked to take it, their specialty matches, they are
 * available, then the least busy.
 */
export function rankEngineers(engineers, incident, requesterIds) {
  const score = (e) => [
    requesterIds.has(e.id) ? 0 : 1,
    e.specialties.includes(incident.category) ? 0 : 1,
    AVAILABILITY_RANK[e.availability] ?? 3,
    e.active,
  ]
  return [...engineers].sort((a, b) => {
    const [x, y] = [score(a), score(b)]
    const i = x.findIndex((v, k) => v !== y[k])
    return i === -1 ? a.full_name.localeCompare(b.full_name) : x[i] - y[i]
  })
}
