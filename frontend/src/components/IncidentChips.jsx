import { Chip } from '@mui/material'

import { PRIORITY_LABELS, STATUS_LABELS } from '../constants/incidents'

function tonedChip(group, value) {
  return (theme) => {
    const colors = (theme.vars || theme).palette[group][value]
    return colors ? { color: colors.fg, bgcolor: colors.bg, '& .MuiChip-icon': { color: 'inherit' } } : {}
  }
}

/** An incident's workflow status, in its status color. */
export function StatusChip({ status, size = 'small', ...props }) {
  return <Chip size={size} label={STATUS_LABELS[status] ?? status} sx={tonedChip('status', status)} {...props} />
}

/** An incident's priority; critical is filled solid so it stands out in lists. */
export function PriorityChip({ priority, size = 'small', ...props }) {
  return (
    <Chip
      size={size}
      label={PRIORITY_LABELS[priority] ?? priority}
      aria-label={`${PRIORITY_LABELS[priority] ?? priority} priority`}
      sx={tonedChip('priority', priority)}
      {...props}
    />
  )
}
