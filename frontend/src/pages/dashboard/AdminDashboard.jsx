import {
  Alert, Box, Button, Chip, Link, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { Link as RouterLink, useSearchParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { PriorityChip, StatusChip } from '../../components/IncidentChips'
import { PageError, PageLoading } from '../../components/PageStatus'
import { AVAILABILITY_LABELS, CATEGORY_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import { timeAgo } from '../../utils/format'
import { CategoryChart, RankedMeters, TrendChart } from './charts'
import DashboardSection from './DashboardSection'
import IncidentRows from './IncidentRows'
import StatTile from './StatTile'
import YourReports from './YourReports'

const PERIODS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' }
const AVAILABILITY_COLOR = { available: 'success', busy: 'warning', off_duty: 'default' }

function hours(value) {
  if (value == null) return '–'
  if (value < 1) return `${Math.round(value * 60)} min`
  if (value < 48) return `${value.toFixed(value < 10 ? 1 : 0)} h`
  return `${(value / 24).toFixed(1)} days`
}

function ResponseTimes({ times }) {
  const rows = [
    ['Acknowledged', 'first action by staff', times.acknowledge],
    ['Assigned', 'an engineer is on it', times.assign],
    ['Resolved', 'the fix is done', times.resolve],
  ]
  return (
    <Table size="small" aria-label="Response times">
      <TableHead>
        <TableRow>
          <TableCell>Time from report to…</TableCell>
          <TableCell align="right">Typical</TableCell>
          <TableCell align="right">Average</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(([label, hint, t]) => (
          <TableRow key={label} sx={{ '&:last-child td': { border: 0 } }}>
            <TableCell>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{hint} · {t.count} incidents</Typography>
            </TableCell>
            <TableCell align="right">{hours(t.median_hours)}</TableCell>
            <TableCell align="right" sx={{ color: 'text.secondary' }}>{hours(t.avg_hours)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Workload({ engineers }) {
  if (!engineers.length) return <Typography sx={{ color: 'text.secondary' }}>No active engineers.</Typography>
  return (
    <TableContainer>
      <Table size="small" aria-label="Engineer workload">
        <TableHead>
          <TableRow>
            <TableCell>Engineer</TableCell>
            <TableCell>Availability</TableCell>
            <TableCell align="right">Active</TableCell>
            <TableCell align="right">Open</TableCell>
            <TableCell align="right">In progress</TableCell>
            <TableCell align="right">Blocked</TableCell>
            <TableCell align="right">Resolved</TableCell>
            <TableCell align="right">Requests</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {engineers.map((e) => (
            <TableRow key={e.id} sx={{ '&:last-child td': { border: 0 } }}>
              <TableCell>
                <Link component={RouterLink} to={`/users/${e.id}`} underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {e.full_name}
                </Link>
                <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                  {e.specialties.map((s) => CATEGORY_LABELS[s] ?? s).join(', ')}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" color={AVAILABILITY_COLOR[e.availability]} label={AVAILABILITY_LABELS[e.availability]} />
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{e.active}</TableCell>
              <TableCell align="right">{e.open}</TableCell>
              <TableCell align="right">{e.in_progress}</TableCell>
              <TableCell align="right" sx={{ color: e.blocked ? 'error.main' : undefined }}>{e.blocked}</TableCell>
              <TableCell align="right">{e.resolved_in_window}</TableCell>
              <TableCell align="right">{e.pending_requests}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function Breakdown({ byStatus, byPriority }) {
  const group = (title, items, chip) => (
    <Stack spacing={1}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>{title}</Typography>
      <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {items.map((item) => (
          <Stack component="li" key={item.key} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            {chip(item.key)}
            <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{item.count}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {group('All incidents by status', byStatus, (key) => <StatusChip status={key} />)}
      {group('Active incidents by priority', byPriority, (key) => <PriorityChip priority={key} />)}
    </Box>
  )
}

/** The facility admin's overview: what needs action, how fast the team responds, and where problems cluster. */
export default function AdminDashboard({ flash }) {
  const { user } = useAuth()
  const { isMobile, isDesktop } = useBreakpoints()
  const [params, setParams] = useSearchParams()
  const days = PERIODS[params.get('days')] ? params.get('days') : '30'
  const buildingId = params.get('building') ?? ''

  const query = new URLSearchParams({ days })
  if (buildingId) query.set('building_id', buildingId)
  const summary = useApiData(`/reports/summary?${query}`)
  const buildings = useApiData('/buildings')
  const pending = useApiData('/assignment-requests?status=pending')

  const setFilter = (name, value) => {
    const next = new URLSearchParams(params)
    if (value && !(name === 'days' && value === '30')) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }

  const period = PERIODS[days].toLowerCase()
  const header = (
    <>
      <Stack direction={isDesktop ? 'row' : 'column'} spacing={2} sx={{ justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'stretch' }}>
        <Stack spacing={0.5}>
          <Typography variant="h2" component="h1">Overview</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Hi {user.full_name.split(' ')[0]}, here's how facilities are doing.</Typography>
        </Stack>
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField select size="small" id="period" label="Period" value={days} onChange={(e) => setFilter('days', e.target.value)} sx={{ minWidth: 150 }}>
            {Object.entries(PERIODS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField select size="small" id="building-filter" label="Building" value={buildings.data ? buildingId : ''} onChange={(e) => setFilter('building', e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="">All buildings</MenuItem>
            {(buildings.data?.items ?? []).map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>)}
          </TextField>
          <Button component={RouterLink} to="/incidents/new" variant="outlined" startIcon={<AddIcon />}>
            Report an incident
          </Button>
        </Stack>
      </Stack>
      {flash && <Alert severity="success">{flash}</Alert>}
      {pending.data?.items.length > 0 && (
        <Alert
          severity="info"
          action={<Button component={RouterLink} to="/requests" color="inherit" size="small">Review</Button>}
        >
          {pending.data.items.length === 1
            ? '1 engineer is waiting for you to approve a request.'
            : `${pending.data.items.length} engineer requests are waiting for your decision.`}
        </Alert>
      )}
    </>
  )

  if (summary.error) return <Stack spacing={3}>{header}<PageError error={summary.error} onRetry={summary.reload} /></Stack>
  if (!summary.data) return <Stack spacing={3}>{header}<PageLoading label="Loading the overview" /></Stack>

  const s = summary.data
  const attention = [
    ...s.attention.escalated.map((i) => ({
      ...i, detail: `Escalated ${timeAgo(i.since)}: ${i.reason ?? ''}${i.assignee_name ? ` · ${i.assignee_name}` : ' · not assigned'}`,
    })),
    ...s.attention.blocked
      .filter((i) => !s.attention.escalated.some((e) => e.id === i.id))
      .map((i) => ({ ...i, detail: `Blocked ${timeAgo(i.since)}: ${i.reason ?? ''} · ${i.assignee_name ?? 'not assigned'}` })),
  ]
  const twoColumns = isDesktop ? 'minmax(0, 3fr) minmax(0, 2fr)' : 'minmax(0, 1fr)'

  return (
    <Stack spacing={3}>
      {header}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))' }}>
        <StatTile label="Active incidents" value={s.totals.active} note="Open, in progress or blocked" />
        <StatTile label="Waiting for an engineer" value={s.totals.unassigned_open} note="Open and unassigned" />
        <StatTile label="Escalated" value={s.totals.escalated_active} note="Still active" />
        <StatTile label="Resolved" value={s.totals.resolved_in_window} note={period} />
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: twoColumns, alignItems: 'start' }}>
        <DashboardSection
          title="Needs attention"
          action={<Link component={RouterLink} to="/incidents?status=active&sort=-priority" underline="hover">All active</Link>}
        >
          {attention.length ? <IncidentRows items={attention} /> : (
            <Typography sx={{ color: 'text.secondary' }}>Nothing is escalated or blocked.</Typography>
          )}
        </DashboardSection>
        <DashboardSection title="Response times">
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Incidents reported in the {period}.</Typography>
          <ResponseTimes times={s.response_times} />
        </DashboardSection>
      </Box>

      <DashboardSection title={`Reported and resolved per day · ${period}`}>
        <TrendChart trend={s.trend} />
      </DashboardSection>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: twoColumns, alignItems: 'start' }}>
        <DashboardSection title="Most common problems">
          <CategoryChart items={s.by_category} labels={CATEGORY_LABELS} />
        </DashboardSection>
        <DashboardSection title="Where things stand">
          <Breakdown byStatus={s.by_status} byPriority={s.by_priority} />
        </DashboardSection>
      </Box>

      <DashboardSection title="Engineer workload" action={<Link component={RouterLink} to="/users?role=engineer" underline="hover">Manage engineers</Link>}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Busiest first. Resolved counts cover the {period}.</Typography>
        <Workload engineers={s.workload ?? []} />
      </DashboardSection>

      <DashboardSection title="Recurring problem spots">
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Locations with the most incidents reported in the {period}.</Typography>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: isDesktop ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
          {[['Buildings', 'buildings'], ['Floors', 'floors'], ['Seats and desks', 'seats']].map(([title, key]) => (
            <Stack key={key} spacing={1.5}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{title}</Typography>
              <RankedMeters items={s.hotspots?.[key] ?? []} emptyText="No incidents with this detail." />
            </Stack>
          ))}
        </Box>
      </DashboardSection>

      <YourReports />

      {s.communication && s.communication.incidents > 0 && (
        <DashboardSection title="Keeping people informed">
          <Typography>
            Engineers or admins wrote a note on <strong>{s.communication.with_staff_note} of {s.communication.incidents}</strong>{' '}
            incidents ({s.communication.with_staff_note_pct}%) reported in the {period}.
            {s.communication.avg_hours_to_first_staff_note != null && (
              <> The first note came after <strong>{hours(s.communication.avg_hours_to_first_staff_note)}</strong> on average.</>
            )}
          </Typography>
        </DashboardSection>
      )}
    </Stack>
  )
}
