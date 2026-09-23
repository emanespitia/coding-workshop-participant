import { useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material'

import { useAuth } from '../../auth/AuthContext'
import { ROLE_LABELS } from '../../layout/navigation'
import { api } from '../../services/api'
import { formatDateTime, timeAgo } from '../../utils/format'

function NoteEditor({ initial = '', submitLabel, onSubmit, onCancel, autoFocus }) {
  const [body, setBody] = useState(initial)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!body.trim()) {
      setError('Write something first')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(body.trim())
      setBody('')
    } catch (err) {
      setError(err.fields?.body || err.message)
    }
    setSaving(false)
  }

  return (
    <Stack component="form" spacing={1.5} onSubmit={handleSubmit} noValidate>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        id={initial ? 'edit-note' : 'new-note'}
        label={initial ? 'Edit note' : 'Add a note'}
        placeholder={initial ? undefined : 'Share an update or answer a question'}
        multiline
        minRows={2}
        autoFocus={autoFocus}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 5000 } }}
      />
      <Stack direction="row" spacing={1}>
        <Button
          type="submit"
          variant={initial ? 'contained' : 'outlined'}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel} disabled={saving}>Cancel</Button>}
      </Stack>
    </Stack>
  )
}

function Note({ note, incident, canChange, onChanged }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(null)
  const isStaff = note.author.role !== 'employee'
  const mine = note.author.id === user.id
  const edited = note.updated_at !== note.created_at

  const remove = async () => {
    setError(null)
    try {
      await api.delete(`/incidents/${incident.id}/notes/${note.id}`)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Box
      component="li"
      sx={{
        p: 2,
        borderRadius: 1,
        bgcolor: isStaff ? 'surface.subtle' : 'transparent',
        border: 1,
        borderColor: isStaff ? 'transparent' : 'divider',
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>{mine ? 'You' : note.author.full_name}</Typography>
          {isStaff && <Chip size="small" variant="outlined" color="primary" label={ROLE_LABELS[note.author.role]} />}
          <Typography variant="body2" component="span" title={formatDateTime(note.created_at)} sx={{ color: 'text.secondary' }}>
            {timeAgo(note.created_at)}{edited && ' · edited'}
          </Typography>
        </Stack>
        {editing ? (
          <NoteEditor
            initial={note.body}
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              await api.patch(`/incidents/${incident.id}/notes/${note.id}`, { body })
              setEditing(false)
              onChanged()
            }}
          />
        ) : (
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.body}</Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {mine && canChange && !editing && (
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="small" color="error" onClick={remove}>Delete</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

/** The conversation on an incident between the reporter, the engineer and admins. */
export default function NotesSection({ incident, notes, onChanged }) {
  const canAdd = incident.allowed_actions.includes('add_note')

  return (
    <Paper variant="outlined" component="section" aria-labelledby="notes-heading" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Typography id="notes-heading" variant="h3" component="h2">
          Notes {notes.length > 0 && <Typography component="span" sx={{ color: 'text.secondary' }}>({notes.length})</Typography>}
        </Typography>
        {notes.length === 0 ? (
          <Typography sx={{ color: 'text.secondary' }}>
            No notes yet. Engineers and facility admins post updates here.
          </Typography>
        ) : (
          <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {notes.map((note) => (
              <Note key={note.id} note={note} incident={incident} canChange={canAdd} onChanged={onChanged} />
            ))}
          </Stack>
        )}
        {canAdd ? (
          <>
            <Divider />
            <NoteEditor
              submitLabel="Post note"
              onSubmit={async (body) => {
                await api.post(`/incidents/${incident.id}/notes`, { body })
                onChanged()
              }}
            />
          </>
        ) : (
          incident.status === 'closed' && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>This incident is closed, so notes are read-only.</Typography>
          )
        )}
      </Stack>
    </Paper>
  )
}
