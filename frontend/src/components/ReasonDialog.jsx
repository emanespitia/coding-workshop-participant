import { useState } from 'react'
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material'

/**
 * A confirmation dialog with a text box (a reason, a resolution note…).
 * `onConfirm(text)` may return a promise; its error is shown in the dialog.
 */
export default function ReasonDialog({
  open, title, intro, label, confirm = 'Confirm', color = 'primary', required = false, maxLength = 2000,
  onConfirm, onClose,
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const close = () => {
    if (submitting) return
    setText('')
    setError(null)
    onClose()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (required && !text.trim()) {
      setError('This is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(text.trim() || null)
      setText('')
      setSubmitting(false)
      onClose()
    } catch (err) {
      setError(err.fields?.comment || err.fields?.reason || err.message)
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="reason-dialog-title">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="reason-dialog-title">{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {intro && <Typography sx={{ color: 'text.secondary' }}>{intro}</Typography>}
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              id="reason-dialog-text"
              label={label}
              multiline
              minRows={3}
              autoFocus
              required={required}
              value={text}
              onChange={(event) => setText(event.target.value)}
              slotProps={{ htmlInput: { maxLength } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={submitting}>Back</Button>
          <Button
            type="submit"
            variant="contained"
            color={color}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {confirm}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
