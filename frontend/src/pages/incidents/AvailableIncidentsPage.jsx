import { Box, FormControlLabel, Pagination, Stack, Switch, Typography } from '@mui/material'
import { useSearchParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import RequestAssignment from '../../components/RequestAssignment'
import { CATEGORY_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import IncidentCollection from './IncidentCollection'

const PAGE_SIZE = 10

/**
 * Open incidents nobody has taken yet, most urgent first. Engineers ask to take one and
 * an admin approves. By default only incidents matching the engineer's specialties show.
 */
export default function AvailableIncidentsPage() {
  const { user } = useAuth()
  const { isDesktop } = useBreakpoints()
  const [params, setParams] = useSearchParams()
  const everything = params.get('all') === '1'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const specialties = user.engineer_profile?.specialties ?? []

  const query = new URLSearchParams({
    scope: 'available', sort: '-priority', page: String(page), page_size: String(PAGE_SIZE),
  })
  if (!everything && specialties.length) query.set('category', specialties.join(','))
  const incidents = useApiData(`/incidents?${query}`)
  const requests = useApiData('/assignment-requests?status=pending')

  const pendingByIncident = Object.fromEntries((requests.data?.items ?? []).map((r) => [r.incident.id, r]))
  const refresh = () => {
    incidents.reload()
    requests.reload()
  }
  const setView = (changes) => {
    const next = new URLSearchParams()
    const all = changes.all ?? everything
    const nextPage = changes.page ?? 1
    if (all) next.set('all', '1')
    if (nextPage > 1) next.set('page', String(nextPage))
    setParams(next)
  }

  const { data } = incidents
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">Available</Typography>
        <Typography sx={{ color: 'text.secondary', maxWidth: '70ch' }}>
          Open incidents nobody has taken yet, most urgent first. Ask to take one and a facility admin will
          approve it.
        </Typography>
      </Stack>

      <FormControlLabel
        control={<Switch checked={!everything} onChange={(event) => setView({ all: !event.target.checked })} />}
        label={`Only my specialties (${specialties.map((s) => CATEGORY_LABELS[s] ?? s).join(', ')})`}
      />

      {incidents.error && <PageError error={incidents.error} onRetry={refresh} />}
      {!incidents.error && !data && <PageLoading label="Loading available incidents" />}

      {data && data.total === 0 && (
        <EmptyState title="Nothing waiting right now">
          {everything
            ? 'Every open incident has an engineer. New ones will show up here.'
            : 'No open incidents match your specialties. Switch off the filter to see everything that is waiting.'}
        </EmptyState>
      )}

      {data && data.total > 0 && (
        <Stack spacing={2} sx={{ opacity: incidents.loading ? 0.6 : 1, transition: 'opacity 120ms' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} aria-live="polite">
            {data.total === 1 ? '1 incident waiting' : `${data.total} incidents waiting`}
          </Typography>
          <IncidentCollection
            items={data.items}
            action={(incident) => (
              <RequestAssignment
                size="small"
                incident={incident}
                pendingRequest={pendingByIncident[incident.id]}
                onChange={refresh}
              />
            )}
          />
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, next) => setView({ page: next })}
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
