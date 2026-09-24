import { useState } from 'react'
import { Alert, Button, CircularProgress, MenuItem, Paper, Stack, TextField } from '@mui/material'

import { CATEGORY_LABELS, PRIORITY_LABELS } from '../../constants/incidents'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import LocationFields from './LocationFields'

const EMPTY = {
  title: '', description: '', category: '', priority: 'medium', building_id: '', floor_id: '', seat_id: '',
}

function validate(values) {
  const errors = {}
  if (!values.title.trim()) errors.title = 'Give the incident a short title'
  else if (values.title.trim().length > 200) errors.title = 'Use 200 characters or fewer'
  if (!values.description.trim()) errors.description = 'Describe what is wrong'
  else if (values.description.trim().length > 5000) errors.description = 'Use 5000 characters or fewer'
  if (!values.category) errors.category = 'Choose the kind of problem'
  if (!values.building_id) errors.building_id = 'Choose the building'
  return errors
}

/** The form values as the API expects them. */
function toPayload(values, withPriority) {
  const payload = {
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category,
    building_id: Number(values.building_id),
    floor_id: values.floor_id ? Number(values.floor_id) : null,
    seat_id: values.seat_id ? Number(values.seat_id) : null,
  }
  if (withPriority) payload.priority = values.priority
  return payload
}

/**
 * Report or edit an incident. `priority`: 'suggest' (reporters suggest one when
 * reporting), 'set' (admins), or false (hidden).
 * `onSubmit(payload)` returns a promise; API field errors are shown on the fields.
 */
export default function IncidentForm({ initial = EMPTY, priority = 'suggest', submitLabel, onSubmit, onCancel }) {
  const { isMobile } = useBreakpoints()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const update = (name) => (event) => {
    setValues((v) => ({ ...v, [name]: event.target.value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      // Usually navigates away; if it returns (e.g. "Back to editing"), the form is usable again.
      await onSubmit(toPayload(values, Boolean(priority)))
      setSubmitting(false)
    } catch (error) {
      setErrors(error.fields || {})
      setFormError(error.fields && Object.keys(error.fields).length ? 'Check the highlighted fields.' : error.message)
      setSubmitting(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack component="form" spacing={2.5} noValidate onSubmit={handleSubmit} aria-label={submitLabel}>
        {formError && <Alert severity="error">{formError}</Alert>}

        <TextField
          id="title"
          label="What's wrong?"
          placeholder="e.g. Air conditioning not cooling on Floor 2"
          required
          value={values.title}
          onChange={update('title')}
          error={Boolean(errors.title)}
          helperText={errors.title || 'A short summary people will recognise in a list'}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        <TextField
          id="description"
          label="Details"
          placeholder="What did you notice, since when, and how is it affecting people?"
          required
          multiline
          minRows={4}
          value={values.description}
          onChange={update('description')}
          error={Boolean(errors.description)}
          helperText={errors.description || ' '}
          slotProps={{ htmlInput: { maxLength: 5000 } }}
        />

        <Stack direction={isMobile ? 'column' : 'row'} spacing={2}>
          <TextField
            select
            id="category"
            label="Kind of problem"
            required
            value={values.category}
            onChange={update('category')}
            error={Boolean(errors.category)}
            helperText={errors.category || ' '}
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>
          {priority && (
            <TextField
              select
              id="priority"
              label={priority === 'suggest' ? 'How urgent is it?' : 'Priority'}
              value={values.priority}
              onChange={update('priority')}
              error={Boolean(errors.priority)}
              helperText={errors.priority || (priority === 'suggest' ? 'A facility admin may adjust this' : ' ')}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </TextField>
          )}
        </Stack>

        <LocationFields
          value={values}
          stacked={isMobile}
          errors={errors}
          onChange={(location) => {
            setValues((v) => ({ ...v, ...location }))
            setErrors((e) => ({ ...e, building_id: undefined, floor_id: undefined, seat_id: undefined }))
          }}
        />

        <Stack direction="row" spacing={1.5}>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {submitLabel}
          </Button>
          {onCancel && <Button onClick={onCancel} disabled={submitting}>Cancel</Button>}
        </Stack>
      </Stack>
    </Paper>
  )
}
