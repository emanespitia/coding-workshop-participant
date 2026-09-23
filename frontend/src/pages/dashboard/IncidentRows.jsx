import { Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

import { PriorityChip, StatusChip } from '../../components/IncidentChips'

/**
 * A compact list of incidents for dashboards. Each item: { id, title, status, priority? }
 * plus a `detail` line; `action(item)` adds a control on the right.
 */
export default function IncidentRows({ items, action, showPriority = false }) {
  return (
    <Stack component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {items.map((incident) => (
        <Stack
          component="li"
          key={incident.id}
          spacing={0.75}
          sx={{ py: 1.5, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0, pt: 0 } }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Link
              component={RouterLink}
              to={`/incidents/${incident.id}`}
              underline="hover"
              sx={{ fontWeight: 600, color: 'text.primary', minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {incident.title}
            </Link>
            <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
              {showPriority && incident.priority && <PriorityChip priority={incident.priority} />}
              <StatusChip status={incident.status} />
            </Stack>
          </Stack>
          {incident.detail && (
            <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{incident.detail}</Typography>
          )}
          {action && action(incident)}
        </Stack>
      ))}
    </Stack>
  )
}
