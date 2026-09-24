import { useState } from 'react'
import { Alert, Button, Chip, CircularProgress, Link, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

import { PriorityChip, StatusChip } from '../../components/IncidentChips'
import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import { REQUEST_STATUS_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { formatDateTime, timeAgo } from '../../utils/format'

const DECISION_COLOR = { approved: 'success', rejected: 'error', withdrawn: 'default', pending: 'info' }

function RequestCard({ request, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { incident } = request

  return (
    <Paper component="li" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip size="small" color={DECISION_COLOR[request.status]} variant="outlined" label={REQUEST_STATUS_LABELS[request.status]} />
          <StatusChip status={incident.status} />
          <PriorityChip priority={incident.priority} />
        </Stack>
        <Link component={RouterLink} to={`/incidents/${incident.id}`} underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
          #{incident.id} {incident.title}
        </Link>
        <Typography variant="body2" sx={{ color: 'text.secondary' }} title={formatDateTime(request.created_at)}>
          Asked {timeAgo(request.created_at)}
          {request.decided_at && request.status !== 'withdrawn' && request.decided_by &&
            ` · ${REQUEST_STATUS_LABELS[request.status].toLowerCase()} by ${request.decided_by.full_name} ${timeAgo(request.decided_at)}`}
        </Typography>
        {request.message && (
          <Typography variant="body2"><strong>You wrote:</strong> {request.message}</Typography>
        )}
        {request.decision_note && (
          <Typography variant="body2"><strong>Admin's note:</strong> {request.decision_note}</Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {request.status === 'pending' && (
          <Stack direction="row">
            <Button
              size="small"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await api.post(`/assignment-requests/${request.id}/withdraw`)
                  onChanged()
                } catch (err) {
                  setError(err.message)
                  setBusy(false)
                }
              }}
            >
              Withdraw request
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}

function RequestList({ title, items, empty, onChanged }) {
  return (
    <Stack component="section" spacing={1.5}>
      <Typography variant="h3" component="h2">{title}</Typography>
      {items.length ? (
        <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {items.map((request) => <RequestCard key={request.id} request={request} onChanged={onChanged} />)}
        </Stack>
      ) : (
        <Typography sx={{ color: 'text.secondary' }}>{empty}</Typography>
      )}
    </Stack>
  )
}

/** An engineer's requests to take incidents, and what the admins decided. */
export default function MyRequestsPage() {
  const { data, error, reload } = useApiData('/assignment-requests')

  return (
    <Stack spacing={3} sx={{ maxWidth: 820 }}>
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">My requests</Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          Incidents you asked to take. When an admin approves, the incident moves to My work.
        </Typography>
      </Stack>
      {error && <PageError error={error} onRetry={reload} />}
      {!error && !data && <PageLoading label="Loading your requests" />}
      {data && data.items.length === 0 && (
        <EmptyState
          title="No requests yet"
          action={<Button component={RouterLink} to="/incidents/available" variant="contained">See available incidents</Button>}
        >
          Find an open incident you can fix and ask to take it.
        </EmptyState>
      )}
      {data && data.items.length > 0 && (
        <>
          <RequestList
            title="Waiting for a decision"
            items={data.items.filter((r) => r.status === 'pending')}
            empty="Nothing waiting."
            onChanged={reload}
          />
          <RequestList
            title="Decided"
            items={data.items.filter((r) => r.status !== 'pending')}
            empty="No decisions yet."
            onChanged={reload}
          />
        </>
      )}
    </Stack>
  )
}
