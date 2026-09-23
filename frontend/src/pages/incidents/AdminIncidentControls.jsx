import { useState } from 'react'
import { Alert, Button, MenuItem, Stack, TextField } from '@mui/material'
import { useNavigate } from 'react-router'

import ConfirmDialog from '../../components/ConfirmDialog'
import { PRIORITY_LABELS } from '../../constants/incidents'
import { api } from '../../services/api'
import AssignDialog from './AssignDialog'

/** Admin-only controls on an incident: engineer, priority, escalation, delete. */
export default function AdminIncidentControls({ incident, onDone }) {
  const navigate = useNavigate()
  const actions = incident.allowed_actions
  const [assigning, setAssigning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async (request) => {
    setBusy(true)
    setError(null)
    try {
      await request()
      onDone()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (!['assign', 'change_priority', 'deescalate', 'delete'].some((a) => actions.includes(a))) return null

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {actions.includes('assign') && (
          <Button
            variant={incident.assignee ? 'outlined' : 'contained'}
            onClick={() => setAssigning(true)}
            disabled={busy}
          >
            {incident.assignee ? 'Change engineer' : 'Assign engineer'}
          </Button>
        )}
        {actions.includes('change_priority') && (
          <TextField
            select
            size="small"
            id="admin-priority"
            label="Priority"
            value={incident.priority}
            disabled={busy}
            onChange={(event) => run(() => api.patch(`/incidents/${incident.id}`, { priority: event.target.value }))}
            sx={{ width: 150 }}
            fullWidth={false}
          >
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
        )}
        {actions.includes('deescalate') && (
          <Button
            variant="outlined"
            color="warning"
            disabled={busy}
            onClick={() => run(() => api.delete(`/incidents/${incident.id}/escalation`))}
          >
            Remove escalation
          </Button>
        )}
        {actions.includes('delete') && (
          <Button color="error" disabled={busy} onClick={() => setDeleting(true)}>Delete</Button>
        )}
      </Stack>

      {assigning && <AssignDialog open incident={incident} onClose={() => setAssigning(false)} onDone={onDone} />}
      <ConfirmDialog
        open={deleting}
        title={`Delete incident #${incident.id}?`}
        confirm="Delete incident"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api.delete(`/incidents/${incident.id}`)
          navigate('/incidents', { replace: true, state: { flash: `Incident #${incident.id} was deleted.` } })
        }}
      >
        Its history, notes and assignment requests are deleted too. This can't be undone. To keep a record,
        close the incident instead.
      </ConfirmDialog>
    </Stack>
  )
}
