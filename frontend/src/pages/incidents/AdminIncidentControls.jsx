import { useState } from 'react'
import { Alert, Button, Link, MenuItem, Stack, TextField } from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router'

import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import { PRIORITY_LABELS } from '../../constants/incidents'
import { api } from '../../services/api'
import AssignDialog from './AssignDialog'

/** Admin-only controls on an incident: engineer, priority, escalation, delete. */
export default function AdminIncidentControls({ incident, onDone }) {
  const navigate = useNavigate()
  const actions = incident.allowed_actions
  const [assigning, setAssigning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [closingAsDuplicate, setClosingAsDuplicate] = useState(false)
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

  const managed = ['assign', 'change_priority', 'deescalate', 'close_as_duplicate', 'delete']
  if (!managed.some((a) => actions.includes(a))) return null
  const possible = incident.possible_duplicate_of
  const closeAsDuplicate = (originalId) => run(() => api.post(
    `/incidents/${incident.id}/close-as-duplicate`, { duplicate_of_id: originalId },
  ))

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {possible && actions.includes('dismiss_possible_duplicate') && (
        <Alert
          severity="warning"
          action={(
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" disabled={busy} onClick={() => closeAsDuplicate(possible.id)}>
                Close as duplicate
              </Button>
              <Button
                color="inherit"
                size="small"
                disabled={busy}
                onClick={() => run(() => api.delete(`/incidents/${incident.id}/possible-duplicate`))}
              >
                Not a duplicate
              </Button>
            </Stack>
          )}
        >
          Possibly the same problem as{' '}
          <Link component={RouterLink} to={`/incidents/${possible.id}`} color="inherit" sx={{ fontWeight: 600 }}>
            #{possible.id} {possible.title}
          </Link>{' '}
          ({possible.status.replace('_', ' ')}). It was already open when this one was reported.
        </Alert>
      )}
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
        {actions.includes('close_as_duplicate') && (
          <Button disabled={busy} onClick={() => setClosingAsDuplicate(true)}>Close as duplicate…</Button>
        )}
        {actions.includes('delete') && (
          <Button color="error" disabled={busy} onClick={() => setDeleting(true)}>Delete</Button>
        )}
      </Stack>

      {assigning && <AssignDialog open incident={incident} onClose={() => setAssigning(false)} onDone={onDone} />}
      {closingAsDuplicate && (
        <FormDialog
          open
          title="Close as a duplicate"
          fields={[{
            name: 'duplicate_of_id',
            label: 'Incident number it duplicates',
            type: 'number',
            required: true,
            helperText: 'The incident that stays open, e.g. 12',
          }]}
          initial={{ duplicate_of_id: possible ? String(possible.id) : '' }}
          submitLabel="Close as duplicate"
          onClose={() => setClosingAsDuplicate(false)}
          onSubmit={async ({ duplicate_of_id: original }) => {
            await api.post(`/incidents/${incident.id}/close-as-duplicate`, {
              duplicate_of_id: Number(String(original).replace('#', '')),
            })
            onDone()
          }}
        />
      )}
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
