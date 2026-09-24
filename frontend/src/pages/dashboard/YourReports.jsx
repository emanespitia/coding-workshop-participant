import { Link, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

import { PageError, PageLoading } from '../../components/PageStatus'
import { useApiData } from '../../hooks/useApiData'
import { formatLocation, timeAgo } from '../../utils/format'
import DashboardSection from './DashboardSection'
import IncidentRows from './IncidentRows'

/** Engineers' and admins' most recently updated own reports, linking to My reports. */
export default function YourReports() {
  const { data, error, reload } = useApiData('/incidents?scope=reported&sort=-updated_at&page_size=3')

  return (
    <DashboardSection
      title="Your reports"
      action={<Link component={RouterLink} to="/incidents/mine" underline="hover">See all</Link>}
    >
      {error && <PageError error={error} onRetry={reload} />}
      {!data && !error && <PageLoading label="Loading your reports" />}
      {data && (data.items.length ? (
        <IncidentRows
          items={data.items.map((i) => ({ ...i, detail: `${formatLocation(i)} · updated ${timeAgo(i.updated_at)}` }))}
        />
      ) : (
        <Typography sx={{ color: 'text.secondary' }}>
          You haven't reported anything. Spotted a problem? Use Report an incident.
        </Typography>
      ))}
    </DashboardSection>
  )
}
