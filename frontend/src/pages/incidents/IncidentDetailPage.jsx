import { useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Link, Paper, Stack, Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Link as RouterLink, useLocation, useParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { PriorityChip, StatusChip } from '../../components/IncidentChips'
import { PageError, PageLoading } from '../../components/PageStatus'
import ReasonDialog from '../../components/ReasonDialog'
import RequestAssignment from '../../components/RequestAssignment'
import { CATEGORY_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import { navItemsFor } from '../../layout/navigation'
import { api } from '../../services/api'
import { formatDateTime, formatLocation } from '../../utils/format'
import { transitionAction } from '../../utils/incidentActions'
import AdminIncidentControls from './AdminIncidentControls'
import HistoryList from './HistoryList'
import NotesSection from './NotesSection'
import WorkflowStepper from './WorkflowStepper'

function Detail({ label, children }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="overline" component="dt" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{children}</Typography>
    </Stack>
  )
}

/** Reasons and outcomes worth calling out above the description. */
function Outcome({ incident }) {
  if (incident.status === 'blocked' && incident.blocked_reason) {
    return <Alert severity="warning"><strong>Blocked:</strong> {incident.blocked_reason}</Alert>
  }
  if (incident.resolution && ['resolved', 'closed'].includes(incident.status)) {
    return <Alert severity="success"><strong>Resolution:</strong> {incident.resolution}</Alert>
  }
  if (incident.status === 'closed' && incident.close_reason) {
    return <Alert severity="info"><strong>Closed:</strong> {incident.close_reason}</Alert>
  }
  return null
}

/** Buttons for what the current user may do: workflow moves, edit, escalate. */
function Actions({ incident, onDone }) {
  const { user } = useAuth()
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const move = async (status, comment = null) => {
    await api.post(`/incidents/${incident.id}/status`, { status, comment })
    onDone()
  }

  const moves = incident.allowed_transitions.map((to) => ({ to, ...transitionAction(incident, to, user.id) }))
  const canEdit = incident.allowed_actions.includes('edit')
  const canEscalate = incident.allowed_actions.includes('escalate')
  const myRequest = incident.my_assignment_request
  const pendingRequest = myRequest?.status === 'pending' ? myRequest : null
  const canRequest = incident.allowed_actions.includes('request_assignment')

  if (!moves.length && !canEdit && !canEscalate && !canRequest && !pendingRequest) return null

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {myRequest?.status === 'rejected' && canRequest && (
        <Alert severity="info">An admin turned down your earlier request for this incident. You can ask again.</Alert>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {(canRequest || pendingRequest) && (
          <RequestAssignment incident={incident} pendingRequest={pendingRequest} onChange={onDone} />
        )}
        {moves.map((action) => (
          <Button
            key={action.to}
            variant={action.variant ?? 'outlined'}
            color={action.color ?? 'primary'}
            disabled={Boolean(busy)}
            startIcon={busy === action.to ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={async () => {
              if (action.comment) {
                setDialog({
                  ...action.comment,
                  confirm: action.comment.confirm ?? action.label,
                  color: action.color,
                  onConfirm: (text) => move(action.to, text),
                })
                return
              }
              setBusy(action.to)
              setError(null)
              try {
                await move(action.to)
              } catch (err) {
                setError(err.message)
              }
              setBusy(null)
            }}
          >
            {action.label}
          </Button>
        ))}
        {canEdit && (
          <Button component={RouterLink} to={`/incidents/${incident.id}/edit`} variant="outlined">Edit details</Button>
        )}
        {canEscalate && (
          <Button
            variant="outlined"
            color="warning"
            onClick={() => setDialog({
              title: 'Escalate this incident?',
              intro: 'Escalating flags it to the facility admins as needing attention. Use it when the problem is urgent or taking too long.',
              label: 'Why does it need attention?',
              confirm: 'Escalate',
              color: 'warning',
              required: true,
              onConfirm: async (reason) => {
                await api.post(`/incidents/${incident.id}/escalate`, { reason })
                onDone()
              },
            })}
          >
            Escalate
          </Button>
        )}
      </Stack>
      <ReasonDialog open={Boolean(dialog)} {...(dialog ?? {})} onClose={() => setDialog(null)} />
    </Stack>
  )
}

export default function IncidentDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { isDesktop } = useBreakpoints()
  const location = useLocation()
  const [flash, setFlash] = useState(location.state?.flash ?? null)

  const incident = useApiData(`/incidents/${id}`)
  const notes = useApiData(`/incidents/${id}/notes`)
  const events = useApiData(`/incidents/${id}/events`)
  const reloadAll = () => {
    incident.reload()
    notes.reload()
    events.reload()
  }

  const backLabel = navItemsFor(user.role).find((item) => item.to === '/incidents')?.label ?? 'Incidents'
  const back = (
    <Link component={RouterLink} to="/incidents" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <ArrowBackIcon fontSize="small" /> {backLabel}
    </Link>
  )

  if (incident.error) {
    return (
      <Stack spacing={2}>
        {back}
        <PageError error={incident.error} onRetry={incident.reload} notFound="This incident doesn't exist, or you don't have access to it." />
      </Stack>
    )
  }
  if (!incident.data) return <PageLoading label="Loading incident" />

  const item = incident.data.incident

  return (
    <Stack spacing={3}>
      {back}
      {flash && <Alert severity="success" onClose={() => setFlash(null)}>{flash}</Alert>}

      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusChip status={item.status} />
          <PriorityChip priority={item.priority} />
          {item.is_escalated && <Chip size="small" label="Escalated" color="warning" variant="outlined" />}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>#{item.id}</Typography>
        </Stack>
        <Typography variant="h2" component="h1" sx={{ overflowWrap: 'anywhere' }}>{item.title}</Typography>
        <Actions incident={item} onDone={reloadAll} />
        {user.role === 'admin' && <AdminIncidentControls incident={item} onDone={reloadAll} />}
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <WorkflowStepper incident={item} />
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: isDesktop ? 'minmax(0, 2fr) minmax(280px, 1fr)' : 'minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Paper variant="outlined" component="section" aria-labelledby="description-heading" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={2}>
              <Typography id="description-heading" variant="h3" component="h2">What's wrong</Typography>
              <Outcome incident={item} />
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.description}</Typography>
            </Stack>
          </Paper>
          {notes.data
            ? <NotesSection incident={item} notes={notes.data.items} onChanged={reloadAll} />
            : notes.error ? <PageError error={notes.error} onRetry={notes.reload} /> : <PageLoading label="Loading notes" />}
        </Stack>

        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Paper variant="outlined" component="section" aria-labelledby="details-heading" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={2}>
              <Typography id="details-heading" variant="h3" component="h2">Details</Typography>
              <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
                <Detail label="Where">{formatLocation(item)}</Detail>
                <Detail label="Kind of problem">{CATEGORY_LABELS[item.category] ?? item.category}</Detail>
                <Detail label="Engineer">{item.assignee?.full_name ?? 'Not assigned yet'}</Detail>
                <Detail label="Reported by">
                  {item.reporter.id === user.id ? 'You' : item.reporter.full_name} · {formatDateTime(item.created_at)}
                </Detail>
                {item.is_escalated && <Detail label="Escalated because">{item.escalation_reason}</Detail>}
                <Detail label="Last updated">{formatDateTime(item.updated_at)}</Detail>
              </Stack>
            </Stack>
          </Paper>
          {events.data && <HistoryList events={events.data.items} />}
        </Stack>
      </Box>
    </Stack>
  )
}
