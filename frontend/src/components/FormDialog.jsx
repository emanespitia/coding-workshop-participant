import { useState } from 'react'
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField,
} from '@mui/material'

/**
 * A small form in a dialog. `fields`: [{ name, label, type?, required?, helperText?, maxLength? }].
 * `onSubmit(values)` returns a promise; API field errors (same names) show on the fields.
 */
export default function FormDialog({ open, title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? ''])))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const missing = Object.fromEntries(
      fields.filter((f) => f.required && !String(values[f.name]).trim()).map((f) => [f.name, `Enter the ${f.label.toLowerCase()}`]),
    )
    setErrors(missing)
    setFormError(null)
    if (Object.keys(missing).length) return
    setBusy(true)
    try {
      await onSubmit(values)
      setBusy(false)
      onClose()
    } catch (error) {
      setErrors(error.fields || {})
      setFormError(error.fields && Object.keys(error.fields).length ? null : error.message)
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs" aria-labelledby="form-dialog-title">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="form-dialog-title">{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            {fields.map((f, index) => (
              <TextField
                key={f.name}
                id={`form-${f.name}`}
                label={f.label}
                type={f.type ?? 'text'}
                required={f.required}
                autoFocus={index === 0}
                value={values[f.name]}
                onChange={(event) => {
                  setValues((v) => ({ ...v, [f.name]: event.target.value }))
                  setErrors((e) => ({ ...e, [f.name]: undefined }))
                }}
                error={Boolean(errors[f.name])}
                helperText={errors[f.name] || f.helperText || ' '}
                slotProps={{ htmlInput: { maxLength: f.maxLength } }}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
