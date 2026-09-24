import { Alert, Button, Stack, Typography } from '@mui/material'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { PageError, PageLoading } from '../../components/PageStatus'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import IncidentForm from './IncidentForm'
import { incidentToForm } from './incidentFormValues'

export default function EditIncidentPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useApiData(`/incidents/${id}`)

  if (error) return <PageError error={error} onRetry={reload} notFound="This incident doesn't exist or isn't yours." />
  if (loading || !data) return <PageLoading label="Loading incident" />

  const { incident } = data
  const backToIncident = `/incidents/${incident.id}`

  if (!incident.allowed_actions.includes('edit')) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Alert severity="info">
          This incident can't be edited any more because work has started on it. Add a note instead.
        </Alert>
        <Button component={RouterLink} to={backToIncident} variant="outlined">Back to the incident</Button>
      </Stack>
    )
  }

  const initial = incidentToForm(incident)
  const save = async (payload) => {
    // Send only what changed.
    const changes = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => value !== (initial[key] === '' ? null : initial[key])),
    )
    if (Object.keys(changes).length) await api.patch(`/incidents/${incident.id}`, changes)
    navigate(backToIncident, { replace: true, state: { flash: 'Your changes have been saved.' } })
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">Edit incident #{incident.id}</Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          You can change the details until an engineer starts work on it.
        </Typography>
      </Stack>
      <IncidentForm
        initial={initial}
        priority={user.role === 'admin' ? 'set' : false}
        submitLabel="Save changes"
        onSubmit={save}
        onCancel={() => navigate(backToIncident)}
      />
    </Stack>
  )
}
