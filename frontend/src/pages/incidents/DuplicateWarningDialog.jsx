import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material'

import { StatusChip } from '../../components/IncidentChips'
import { CATEGORY_LABELS } from '../../constants/incidents'
import { formatLocation, timeAgo } from '../../utils/format'

/**
 * Shown before reporting when similar active incidents exist. Only safe details are shown
 * (title, location, category, status, age); other people's reports stay private.
 * `onChoose` receives 'same' (it's one of these), 'different' (report anyway) or 'edit'.
 */
export default function DuplicateWarningDialog({ open, incidents, onChoose }) {
  const count = incidents.length
  return (
    <Dialog open={open} onClose={() => onChoose('edit')} fullWidth maxWidth="sm" aria-labelledby="duplicate-title">
      <DialogTitle id="duplicate-title">This may already be reported</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography sx={{ color: 'text.secondary' }}>
            {count === 1 ? '1 open incident looks similar' : `${count} open incidents look similar`}. If it's the same
            problem, there's no need to report it again: the facilities team already knows.
          </Typography>
          <Stack component="ul" spacing={1.5} aria-label="Similar incidents" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {incidents.map((incident) => (
              <Stack
                component="li"
                key={incident.id}
                spacing={0.5}
                sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider' }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{incident.title}</Typography>
                  <StatusChip status={incident.status} sx={{ flexShrink: 0 }} />
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {formatLocation(incident)} · {CATEGORY_LABELS[incident.category] ?? incident.category} · reported{' '}
                  {timeAgo(incident.created_at)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => onChoose('edit')}>Back to editing</Button>
        <Button variant="outlined" onClick={() => onChoose('different')}>Mine is different, report it</Button>
        <Button variant="contained" onClick={() => onChoose('same')}>It's one of these</Button>
      </DialogActions>
    </Dialog>
  )
}
