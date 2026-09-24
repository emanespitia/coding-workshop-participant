import { useRef, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material'

/** Shows a new temporary password once, with a copy button. */
export default function TemporaryPasswordDialog({ open, title, person, password, onClose }) {
  const [copied, setCopied] = useState(null)
  const box = useRef(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied('Copied')
    } catch {
      // Clipboard blocked: select the text so it can be copied by hand.
      const range = document.createRange()
      range.selectNodeContents(box.current)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      setCopied('Selected. Press Ctrl+C (or ⌘C) to copy.')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="temp-password-title">
      <DialogTitle id="temp-password-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            Give this temporary password to <strong>{person}</strong>. They'll choose their own password the first time
            they sign in.
          </Typography>
          <Box
            ref={box}
            aria-label="Temporary password"
            sx={{
              p: 1.5, borderRadius: 1, bgcolor: 'surface.subtle', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '1.1rem', letterSpacing: '0.04em', textAlign: 'center', userSelect: 'all', overflowWrap: 'anywhere',
            }}
          >
            {password}
          </Box>
          {copied && <Typography variant="body2" sx={{ color: 'success.main' }} role="status">{copied}</Typography>}
          <Alert severity="warning">This password won't be shown again.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={copy}>Copy</Button>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
