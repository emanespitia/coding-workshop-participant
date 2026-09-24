import { useState } from 'react'
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material'

/** "Are you sure?" with a destructive button. `onConfirm` may return a promise; errors show in the dialog. */
export default function ConfirmDialog({ open, title, children, confirm = 'Confirm', color = 'error', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" aria-labelledby="confirm-dialog-title">
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography component="div" sx={{ color: 'text.secondary' }}>{children}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={busy}>Back</Button>
        <Button
          variant="contained"
          color={color}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm()
              setBusy(false)
              onClose()
            } catch (err) {
              setError(err.message)
              setBusy(false)
            }
          }}
        >
          {confirm}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
