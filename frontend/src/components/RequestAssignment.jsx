import { useState } from 'react'
import { Button, Chip, CircularProgress, Stack } from '@mui/material'
import HourglassTopIcon from '@mui/icons-material/HourglassTop'

import { api } from '../services/api'
import ReasonDialog from './ReasonDialog'

/**
 * An engineer's "Request to take" button for an open, unassigned incident. Once asked,
 * it shows the pending request with a Withdraw button. `onChange` runs after either.
 */
export default function RequestAssignment({ incident, pendingRequest, onChange, size = 'medium' }) {
  const [asking, setAsking] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [error, setError] = useState(null)

  if (pendingRequest) {
    return (
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip icon={<HourglassTopIcon />} label="Requested" color="info" variant="outlined" size="small" />
        <Button
          size={size}
          disabled={withdrawing}
          startIcon={withdrawing ? <CircularProgress size={14} color="inherit" /> : null}
          onClick={async () => {
            setWithdrawing(true)
            setError(null)
            try {
              await api.post(`/assignment-requests/${pendingRequest.id}/withdraw`)
              await onChange?.()
            } catch (err) {
              setError(err.message)
            }
            setWithdrawing(false)
          }}
        >
          Withdraw
        </Button>
        {error && <Chip size="small" color="error" label={error} />}
      </Stack>
    )
  }

  return (
    <>
      <Button size={size} variant="outlined" onClick={() => setAsking(true)}>Request to take</Button>
      <ReasonDialog
        open={asking}
        title={`Ask to take #${incident.id}?`}
        intro={`“${incident.title}”. A facility admin will approve or turn down your request.`}
        label="Message for the admin (optional)"
        confirm="Send request"
        maxLength={1000}
        onClose={() => setAsking(false)}
        onConfirm={async (message) => {
          await api.post(`/incidents/${incident.id}/assignment-requests`, { message })
          await onChange?.()
        }}
      />
    </>
  )
}
