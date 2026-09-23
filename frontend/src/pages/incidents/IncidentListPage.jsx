import { useState } from 'react'
import {
  Alert, Box, Button, Chip, InputAdornment, MenuItem, Pagination, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import { useApiData } from '../../hooks/useApiData'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import { navItemsFor } from '../../layout/navigation'
import IncidentCollection from './IncidentCollection'

const PAGE_SIZE = 10

const STATUS_FILTERS = {
  all: { label: 'All statuses' },
  active: { label: 'Active (not resolved)', value: 'open,in_progress,blocked' },
  open: { label: 'Open', value: 'open' },
  in_progress: { label: 'In progress', value: 'in_progress' },
  blocked: { label: 'Blocked', value: 'blocked' },
  resolved: { label: 'Resolved', value: 'resolved' },
  closed: { label: 'Closed', value: 'closed' },
}

const SORTS = {
  '-updated_at': 'Recently updated',
  '-created_at': 'Newest first',
  created_at: 'Oldest first',
  '-priority': 'Most urgent first',
}

// Engineers' "My work" list is what's assigned to them; the API already limits employees
// to what they reported and shows admins everything.
const ROLE_SCOPE = { engineer: 'assigned' }

// Quick filters for admins, kept in the URL as ?escalated=1 / ?unassigned=1.
const QUICK_FILTERS = { escalated: 'Escalated', unassigned: 'Unassigned' }

function buildQuery({ q, status, sort, page, quick }, role) {
  const params = new URLSearchParams({ sort, page: String(page), page_size: String(PAGE_SIZE) })
  if (q) params.set('q', q)
  for (const key of quick) params.set(key, 'true')
  if (STATUS_FILTERS[status]?.value) params.set('status', STATUS_FILTERS[status].value)
  if (ROLE_SCOPE[role]) params.set('scope', ROLE_SCOPE[role])
  return `/incidents?${params}`
}

/**
 * The incidents the user can see: what they reported (employees), what's assigned to
 * them (engineers) or everything (admins). Filters live in the URL so they survive
 * reloads and the back button.
 */
export default function IncidentListPage() {
  const { user } = useAuth()
  const { isDesktop } = useBreakpoints()
  const [params, setParams] = useSearchParams()
  const filters = {
    q: params.get('q') ?? '',
    status: STATUS_FILTERS[params.get('status')] ? params.get('status') : 'all',
    sort: SORTS[params.get('sort')] ? params.get('sort') : '-updated_at',
    page: Math.max(1, Number(params.get('page')) || 1),
    quick: Object.keys(QUICK_FILTERS).filter((key) => params.get(key) === '1'),
  }
  const [search, setSearch] = useState(filters.q)
  const location = useLocation()
  const [flash, setFlash] = useState(location.state?.flash ?? null)
  const { data, error, loading, reload } = useApiData(buildQuery(filters, user.role))

  const title = navItemsFor(user.role).find((item) => item.to === '/incidents')?.label ?? 'Incidents'
  const canReport = user.role === 'employee'
  const filtered = Boolean(filters.q) || filters.status !== 'all' || filters.quick.length > 0

  const setFilters = (changes) => {
    const next = { ...filters, page: 1, ...changes }
    const out = new URLSearchParams()
    if (next.q) out.set('q', next.q)
    if (next.status !== 'all') out.set('status', next.status)
    if (next.sort !== '-updated_at') out.set('sort', next.sort)
    if (next.page > 1) out.set('page', String(next.page))
    for (const key of next.quick) out.set(key, '1')
    setParams(out)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Typography variant="h2" component="h1">{title}</Typography>
        {canReport && (
          <Button component={RouterLink} to="/incidents/new" variant="contained" startIcon={<AddIcon />}>
            Report an incident
          </Button>
        )}
      </Stack>

      {flash && <Alert severity="success" onClose={() => setFlash(null)}>{flash}</Alert>}

      <Stack
        component="form"
        role="search"
        direction={isDesktop ? 'row' : 'column'}
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault()
          setFilters({ q: search.trim() })
        }}
      >
        <TextField
          id="incident-search"
          label="Search"
          placeholder="Title, description or #id"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onBlur={() => search.trim() !== filters.q && setFilters({ q: search.trim() })}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
          }}
          sx={{ flex: 2 }}
        />
        <TextField
          select
          id="status-filter"
          label="Status"
          value={filters.status}
          onChange={(event) => setFilters({ status: event.target.value })}
          sx={{ flex: 1 }}
        >
          {Object.entries(STATUS_FILTERS).map(([key, { label }]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
        </TextField>
        <TextField
          select
          id="sort"
          label="Sort by"
          value={filters.sort}
          onChange={(event) => setFilters({ sort: event.target.value })}
          sx={{ flex: 1 }}
        >
          {Object.entries(SORTS).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
        </TextField>
      </Stack>

      {user.role === 'admin' && (
        <Stack direction="row" spacing={1} aria-label="Quick filters">
          {Object.entries(QUICK_FILTERS).map(([key, label]) => {
            const on = filters.quick.includes(key)
            return (
              <Chip
                key={key}
                label={label}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                aria-pressed={on}
                onClick={() => setFilters({ quick: on ? filters.quick.filter((k) => k !== key) : [...filters.quick, key] })}
              />
            )
          })}
        </Stack>
      )}

      {error && <PageError error={error} onRetry={reload} />}
      {!error && !data && loading && <PageLoading label="Loading incidents" />}

      {data && data.total === 0 && (
        filtered ? (
          <EmptyState
            title="No incidents match"
            action={<Button onClick={() => { setSearch(''); setParams(new URLSearchParams()) }}>Clear filters</Button>}
          >
            Try a different search or status.
          </EmptyState>
        ) : (
          <EmptyState
            title={canReport ? "You haven't reported anything yet" : 'Nothing here yet'}
            action={canReport && (
              <Button component={RouterLink} to="/incidents/new" variant="contained">Report an incident</Button>
            )}
          >
            {canReport
              ? 'When something in the building needs fixing, report it here and follow it until it is done.'
              : 'Incidents will show up here.'}
          </EmptyState>
        )
      )}

      {data && data.total > 0 && (
        <Stack spacing={2} sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity 120ms' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} aria-live="polite">
            {data.total === 1 ? '1 incident' : `${data.total} incidents`}
          </Typography>
          <IncidentCollection items={data.items} />
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Pagination
                count={totalPages}
                page={filters.page}
                onChange={(_, page) => setFilters({ page })}
                color="primary"
                siblingCount={isDesktop ? 1 : 0}
              />
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  )
}
