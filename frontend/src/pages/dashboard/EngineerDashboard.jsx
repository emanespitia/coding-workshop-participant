import { useState } from 'react'
import { Alert, Box, Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import AvailabilityPicker from '../../components/AvailabilityPicker'
import { PageError, PageLoading } from '../../components/PageStatus'
import RequestAssignment from '../../components/RequestAssignment'
import { CATEGORY_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import { formatLocation, timeAgo } from '../../utils/format'
import DashboardSection from './DashboardSection'
import IncidentRows from './IncidentRows'
import StatTile from './StatTile'

function hoursText(value) {
  if (value == null) return null
  if (value < 1) return 'under an hour'
  if (value < 48) return `${Math.round(value)} hours`
  return `${Math.round(value / 24)} days`
}

/** Availability in the header: engineers change it here without opening their profile. */
function AvailabilityControl() {
  const { user, updateProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  return (
    <Stack spacing={0.75} sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' } }}>
      <Typography variant="body2" id="my-availability" sx={{ color: 'text.secondary' }}>Your availability</Typography>
      <AvailabilityPicker
        label="Your availability"
        value={user.engineer_profile?.availability}
        disabled={saving}
        onChange={async (availability) => {
          setSaving(true)
          setError(null)
          try {
            await updateProfile({ engineer_profile: { availability } })
          } catch (err) {
            setError(err.message)
          }
          setSaving(false)
        }}
      />
      {error && <Typography variant="caption" sx={{ color: 'error.main' }}>{error}</Typography>}
    </Stack>
  )
}

/** An engineer's home page: their work, what they could pick up, and how it's going. */
export default function EngineerDashboard({ flash }) {
  const { user } = useAuth()
  const { isMobile, isDesktop } = useBreakpoints()
  const specialties = user.engineer_profile?.specialties ?? []

  const summary = useApiData('/reports/summary?days=30')
  const myWork = useApiData('/incidents?scope=assigned&status=open,in_progress,blocked&sort=-priority&page_size=5')
  const matching = useApiData(
    `/incidents?scope=available&sort=-priority&page_size=5${specialties.length ? `&category=${specialties.join(',')}` : ''}`,
  )
  const pending = useApiData('/assignment-requests?status=pending')
  const pendingByIncident = Object.fromEntries((pending.data?.items ?? []).map((r) => [r.incident.id, r]))

  const header = (
    <>
      <Stack
        direction={isMobile ? 'column' : 'row'}
        spacing={2}
        sx={{ alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between' }}
      >
        <Stack spacing={0.5}>
          <Typography variant="h2" component="h1">Hi, {user.full_name.split(' ')[0]}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            {specialties.map((s) => CATEGORY_LABELS[s] ?? s).join(' · ')}
          </Typography>
        </Stack>
        <AvailabilityControl />
      </Stack>
      {flash && <Alert severity="success">{flash}</Alert>}
    </>
  )

  if (summary.error) return <Stack spacing={3}>{header}<PageError error={summary.error} onRetry={summary.reload} /></Stack>
  if (!summary.data) return <Stack spacing={3}>{header}<PageLoading label="Loading your dashboard" /></Stack>

  const { totals, by_status: byStatus, attention, response_times: times } = summary.data
  const blocked = byStatus.find((s) => s.key === 'blocked')?.count ?? 0
  const attentionItems = [
    ...attention.blocked.map((i) => ({ ...i, detail: `Blocked ${timeAgo(i.since)}: ${i.reason ?? ''}` })),
    ...attention.escalated
      .filter((i) => !attention.blocked.some((b) => b.id === i.id))
      .map((i) => ({ ...i, detail: `Escalated: ${i.reason ?? ''}` })),
  ]
  const refreshPickups = () => {
    matching.reload()
    pending.reload()
  }

  return (
    <Stack spacing={3}>
      {header}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))' }}>
        <StatTile label="Assigned to you" value={totals.active} note="Open, in progress or blocked" />
        <StatTile label="Blocked" value={blocked} />
        <StatTile label="Resolved in the last 30 days" value={totals.resolved_in_window} />
        <StatTile label="Waiting to be taken" value={totals.available_pool ?? 0} note="Open and unassigned" />
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: isDesktop ? 'minmax(0, 3fr) minmax(0, 2fr)' : 'minmax(0, 1fr)', alignItems: 'start' }}>
        <Stack spacing={3}>
          <DashboardSection
            title="Your work"
            action={<Link component={RouterLink} to="/incidents" underline="hover">See all</Link>}
          >
            {myWork.error && <PageError error={myWork.error} onRetry={myWork.reload} />}
            {myWork.data && (myWork.data.items.length ? (
              <IncidentRows
                showPriority
                items={myWork.data.items.map((i) => ({ ...i, detail: `${formatLocation(i)} · updated ${timeAgo(i.updated_at)}` }))}
              />
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>
                Nothing assigned to you right now. Pick something up from the list below.
              </Typography>
            ))}
            {!myWork.data && !myWork.error && <PageLoading label="Loading your work" />}
          </DashboardSection>

          <DashboardSection
            title="Matches your specialties"
            action={<Link component={RouterLink} to="/incidents/available" underline="hover">See all available</Link>}
          >
            {matching.error && <PageError error={matching.error} onRetry={matching.reload} />}
            {matching.data && (matching.data.items.length ? (
              <IncidentRows
                showPriority
                items={matching.data.items.map((i) => ({ ...i, detail: `${formatLocation(i)} · reported ${timeAgo(i.created_at)}` }))}
                action={(incident) => (
                  <RequestAssignment
                    size="small"
                    incident={incident}
                    pendingRequest={pendingByIncident[incident.id]}
                    onChange={refreshPickups}
                  />
                )}
              />
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>No open incidents in your specialties are waiting.</Typography>
            ))}
            {!matching.data && !matching.error && <PageLoading label="Loading available incidents" />}
          </DashboardSection>
        </Stack>

        <Stack spacing={3}>
          <DashboardSection title="Needs attention">
            {attentionItems.length ? (
              <IncidentRows items={attentionItems} />
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>None of your incidents are blocked or escalated.</Typography>
            )}
          </DashboardSection>

          <DashboardSection
            title="Your requests"
            action={<Link component={RouterLink} to="/requests" underline="hover">See all</Link>}
          >
            <Typography>
              {pending.data
                ? pending.data.items.length === 0
                  ? 'No requests waiting for an admin.'
                  : `${pending.data.items.length} waiting for an admin to decide.`
                : '…'}
            </Typography>
          </DashboardSection>

          <DashboardSection title="Your pace">
            {times.resolve.count ? (
              <Typography>
                Of the incidents reported in the last 30 days, you resolved <strong>{times.resolve.count}</strong>, usually
                within <strong>{hoursText(times.resolve.median_hours)}</strong> of them being reported.
              </Typography>
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>
                No incidents from the last 30 days resolved yet. Your typical fix time will show here.
              </Typography>
            )}
          </DashboardSection>
        </Stack>
      </Box>
    </Stack>
  )
}
