import { useState } from 'react'
import {
  Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Radio, RadioGroup, Stack, Typography,
} from '@mui/material'

import { PageError, PageLoading } from '../../components/PageStatus'
import { AVAILABILITY_LABELS, CATEGORY_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { rankEngineers } from '../../utils/engineers'

const AVAILABILITY_COLOR = { available: 'success', busy: 'warning', off_duty: 'default' }
/** Choose (or change, or remove) the engineer working on an incident. Admin only. */
export default function AssignDialog({ open, incident, onClose, onDone }) {
  const workload = useApiData(open ? '/reports/summary?days=30' : null)
  const requests = useApiData(open ? `/assignment-requests?incident_id=${incident.id}&status=pending` : null)
  const [choice, setChoice] = useState(incident.assignee ? String(incident.assignee.id) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const requesterIds = new Set((requests.data?.items ?? []).map((r) => r.engineer.id))
  const engineers = workload.data ? rankEngineers(workload.data.workload ?? [], incident, requesterIds) : []
  const current = incident.assignee ? String(incident.assignee.id) : ''

  const save = async (engineerId) => {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/incidents/${incident.id}/assign`, { engineer_id: engineerId })
      setBusy(false)
      onDone()
      onClose()
    } catch (err) {
      setError(err.fields?.engineer_id || err.message)
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm" aria-labelledby="assign-title">
      <DialogTitle id="assign-title">{incident.assignee ? 'Change the engineer' : 'Assign an engineer'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography sx={{ color: 'text.secondary' }}>
            Best matches first: engineers who asked for it, then {CATEGORY_LABELS[incident.category] ?? incident.category}{' '}
            specialists, then who's available and least busy.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {workload.error && <PageError error={workload.error} onRetry={workload.reload} />}
          {!workload.data && !workload.error && <PageLoading label="Loading engineers" />}
          {workload.data && (
            <RadioGroup
              aria-label="Engineer"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              sx={{ gap: 0.5 }}
            >
              {engineers.map((e) => (
                <FormControlLabel
                  key={e.id}
                  value={String(e.id)}
                  control={<Radio />}
                  sx={{ alignItems: 'flex-start', mx: 0, py: 1, borderBottom: 1, borderColor: 'divider', '& .MuiRadio-root': { mt: -0.5 } }}
                  label={(
                    <Stack spacing={0.5}>
                      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 600 }}>{e.full_name}</Typography>
                        <Chip size="small" variant="outlined" color={AVAILABILITY_COLOR[e.availability]} label={AVAILABILITY_LABELS[e.availability]} />
                        {requesterIds.has(e.id) && <Chip size="small" color="info" label="Asked to take it" />}
                        {String(e.id) === current && <Chip size="small" label="Current" />}
                      </Stack>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {e.specialties.map((s) => CATEGORY_LABELS[s] ?? s).join(', ')} · {e.active} active
                      </Typography>
                    </Stack>
                  )}
                />
              ))}
            </RadioGroup>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        {incident.assignee ? (
          <Button color="error" disabled={busy} onClick={() => save(null)}>Unassign</Button>
        ) : <span />}
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={busy}>Back</Button>
          <Button
            variant="contained"
            disabled={busy || !choice || choice === current}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}
            onClick={() => save(Number(choice))}
          >
            Assign
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  )
}
