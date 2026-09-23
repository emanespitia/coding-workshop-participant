import { Stack, Typography } from '@mui/material'
import { useNavigate } from 'react-router'

import { api } from '../../services/api'
import IncidentForm from './IncidentForm'

export default function ReportIncidentPage() {
  const navigate = useNavigate()

  const report = async (payload) => {
    const { incident } = await api.post('/incidents', payload)
    navigate(`/incidents/${incident.id}`, {
      replace: true,
      state: { flash: "Thanks, your incident has been reported. You'll see every update here." },
    })
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">Report an incident</Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          Tell the facilities team what's wrong and where. They'll assign an engineer and keep you updated.
        </Typography>
      </Stack>
      <IncidentForm submitLabel="Report incident" onSubmit={report} onCancel={() => navigate(-1)} />
    </Stack>
  )
}
