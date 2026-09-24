import { Alert, Box, Button, Link, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { Link as RouterLink } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import { useApiData } from '../../hooks/useApiData'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import { formatLocation, timeAgo } from '../../utils/format'
import DashboardSection from './DashboardSection'
import IncidentRows from './IncidentRows'
import StatTile from './StatTile'

function hours(value) {
  if (value == null) return null
  return value < 1 ? 'under an hour' : `${Math.round(value)} hour${Math.round(value) === 1 ? '' : 's'}`
}

/** An employee's home page: their incidents at a glance. */
export default function EmployeeDashboard({ flash }) {
  const { user } = useAuth()
  const { isMobile, isDesktop } = useBreakpoints()
  const summary = useApiData('/reports/summary?days=30')
  const recent = useApiData('/incidents?sort=-updated_at&page_size=5')
  const firstName = user.full_name.split(' ')[0]

  const header = (
    <>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Stack spacing={0.5}>
          <Typography variant="h2" component="h1">Hi, {firstName}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Here's where your incidents stand.</Typography>
        </Stack>
        <Button component={RouterLink} to="/incidents/new" variant="contained" startIcon={<AddIcon />}>
          Report an incident
        </Button>
      </Stack>
      {flash && <Alert severity="success">{flash}</Alert>}
    </>
  )

  if (summary.error) return <Stack spacing={3}>{header}<PageError error={summary.error} onRetry={summary.reload} /></Stack>
  if (!summary.data) return <Stack spacing={3}>{header}<PageLoading label="Loading your dashboard" /></Stack>

  const { totals, attention, communication } = summary.data
  const needsAttention = [
    ...attention.blocked.map((i) => ({ ...i, detail: `Blocked: ${i.reason ?? 'no reason given'}` })),
    ...attention.escalated
      .filter((i) => !attention.blocked.some((b) => b.id === i.id))
      .map((i) => ({ ...i, detail: `Escalated: ${i.reason ?? ''}` })),
  ]

  if (totals.total === 0) {
    return (
      <Stack spacing={3}>
        {header}
        <EmptyState
          title="Nothing reported yet"
          action={<Button component={RouterLink} to="/incidents/new" variant="contained">Report an incident</Button>}
        >
          When something in the building needs fixing, report it and you'll be able to follow it here until it's done.
        </EmptyState>
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      {header}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))' }}>
        <StatTile label="Still being worked on" value={totals.active} note="Open, in progress or blocked" />
        <StatTile label="Waiting for an engineer" value={totals.unassigned_open} />
        <StatTile label="Fixed in the last 30 days" value={totals.resolved_in_window} />
        <StatTile label="Reported in the last 30 days" value={totals.reported_in_window} />
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: isDesktop ? 'minmax(0, 3fr) minmax(0, 2fr)' : 'minmax(0, 1fr)', alignItems: 'start' }}>
        <DashboardSection
          title="Recently updated"
          action={<Link component={RouterLink} to="/incidents" underline="hover">See all</Link>}
        >
          {recent.data ? (
            <IncidentRows
              items={recent.data.items.map((i) => ({ ...i, detail: `${formatLocation(i)} · updated ${timeAgo(i.updated_at)}` }))}
            />
          ) : recent.error ? <PageError error={recent.error} onRetry={recent.reload} /> : <PageLoading label="Loading recent incidents" />}
        </DashboardSection>

        <Stack spacing={3}>
          <DashboardSection title="Needs attention">
            {needsAttention.length ? (
              <IncidentRows items={needsAttention} />
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>Nothing is blocked or escalated right now.</Typography>
            )}
          </DashboardSection>

          {communication && communication.incidents > 0 && (
            <DashboardSection title="Updates from the team">
              <Typography>
                Engineers or admins wrote to you on <strong>{communication.with_staff_note} of {communication.incidents}</strong>{' '}
                incidents you reported in the last 30 days.
              </Typography>
              {communication.avg_hours_to_first_staff_note != null && (
                <Typography sx={{ color: 'text.secondary' }}>
                  The first reply usually came within {hours(communication.avg_hours_to_first_staff_note)}.
                </Typography>
              )}
            </DashboardSection>
          )}
        </Stack>
      </Box>
    </Stack>
  )
}
