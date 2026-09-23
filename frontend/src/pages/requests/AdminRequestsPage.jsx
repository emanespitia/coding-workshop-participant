import { useState } from 'react'
import { Alert, Button, Chip, Link, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

import { PriorityChip, StatusChip } from '../../components/IncidentChips'
import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import ReasonDialog from '../../components/ReasonDialog'
import { CATEGORY_LABELS, REQUEST_STATUS_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { formatDateTime, timeAgo } from '../../utils/format'

const DECISION_COLOR = { approved: 'success', rejected: 'error', withdrawn: 'default' }
const HISTORY_SIZE = 10

function PendingCard({ request, onDecide }) {
  const { incident, engineer } = request
  return (
    <Paper component="li" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusChip status={incident.status} />
          <PriorityChip priority={incident.priority} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {CATEGORY_LABELS[incident.category] ?? incident.category}
          </Typography>
        </Stack>
        <Link component={RouterLink} to={`/incidents/${incident.id}`} underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
          #{incident.id} {incident.title}
        </Link>
        <Typography variant="body2" title={formatDateTime(request.created_at)}>
          <strong>{engineer.full_name}</strong> asked to take it {timeAgo(request.created_at)}
        </Typography>
        {request.message && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>“{request.message}”</Typography>
        )}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" size="small" onClick={() => onDecide(request, 'approve')}>Approve</Button>
          <Button variant="outlined" color="error" size="small" onClick={() => onDecide(request, 'reject')}>Turn down</Button>
        </Stack>
      </Stack>
    </Paper>
  )
}

/** Engineers' requests to take incidents, waiting for an admin, plus recent decisions. */
export default function AdminRequestsPage() {
  const { data, error, reload } = useApiData('/assignment-requests')
  const [deciding, setDeciding] = useState(null)
  const [flash, setFlash] = useState(null)

  const pending = data?.items.filter((r) => r.status === 'pending') ?? []
  const decided = data?.items.filter((r) => r.status !== 'pending').slice(0, HISTORY_SIZE) ?? []

  return (
    <Stack spacing={3} sx={{ maxWidth: 860 }}>
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">Requests</Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          Engineers asking to take open incidents. Approving assigns the engineer and turns down anyone else who asked
          for the same incident.
        </Typography>
      </Stack>
      {flash && <Alert severity="success" onClose={() => setFlash(null)}>{flash}</Alert>}
      {error && <PageError error={error} onRetry={reload} />}
      {!error && !data && <PageLoading label="Loading requests" />}

      {data && (
        <Stack component="section" spacing={1.5} aria-labelledby="pending-heading">
          <Typography id="pending-heading" variant="h3" component="h2">
            Waiting for you {pending.length > 0 && `(${pending.length})`}
          </Typography>
          {pending.length ? (
            <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {pending.map((r) => (
                <PendingCard key={r.id} request={r} onDecide={(request, decision) => setDeciding({ request, decision })} />
              ))}
            </Stack>
          ) : (
            <EmptyState title="All caught up">No requests are waiting for a decision.</EmptyState>
          )}
        </Stack>
      )}

      {decided.length > 0 && (
        <Stack component="section" spacing={1.5} aria-labelledby="decided-heading">
          <Typography id="decided-heading" variant="h3" component="h2">Recently decided</Typography>
          <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {decided.map((r) => (
              <Stack component="li" key={r.id} direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" variant="outlined" color={DECISION_COLOR[r.status]} label={REQUEST_STATUS_LABELS[r.status]} />
                <Typography variant="body2">
                  <strong>{r.engineer.full_name}</strong> for{' '}
                  <Link component={RouterLink} to={`/incidents/${r.incident.id}`} underline="hover">#{r.incident.id} {r.incident.title}</Link>
                  {r.decided_at && ` · ${timeAgo(r.decided_at)}`}
                  {r.decision_note && ` · “${r.decision_note}”`}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      )}

      {deciding && (
        <ReasonDialog
          open
          title={deciding.decision === 'approve'
            ? `Assign ${deciding.request.engineer.full_name} to #${deciding.request.incident.id}?`
            : `Turn down ${deciding.request.engineer.full_name}'s request?`}
          intro={deciding.decision === 'approve'
            ? 'They become the engineer on this incident. Other engineers who asked for it are turned down.'
            : 'They will see your note in their requests.'}
          label={deciding.decision === 'approve' ? 'Note for the engineer (optional)' : 'Why? (optional)'}
          confirm={deciding.decision === 'approve' ? 'Approve' : 'Turn down'}
          color={deciding.decision === 'approve' ? 'primary' : 'error'}
          maxLength={1000}
          onClose={() => setDeciding(null)}
          onConfirm={async (note) => {
            const { request, decision } = deciding
            await api.post(`/assignment-requests/${request.id}/${decision}`, { note })
            setFlash(decision === 'approve'
              ? `${request.engineer.full_name} is now assigned to #${request.incident.id}.`
              : `${request.engineer.full_name}'s request was turned down.`)
            reload()
          }}
        />
      )}
    </Stack>
  )
}
