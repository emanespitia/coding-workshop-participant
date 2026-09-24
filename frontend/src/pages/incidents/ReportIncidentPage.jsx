import { useState } from 'react'
import { Stack, Typography } from '@mui/material'
import { useNavigate } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { api } from '../../services/api'
import DuplicateWarningDialog from './DuplicateWarningDialog'
import IncidentForm from './IncidentForm'

/** Active incidents that may be the same problem; an empty list if the check itself fails. */
async function findSimilar(payload) {
  const query = new URLSearchParams({ building_id: payload.building_id, category: payload.category, title: payload.title })
  if (payload.floor_id) query.set('floor_id', payload.floor_id)
  if (payload.seat_id) query.set('seat_id', payload.seat_id)
  try {
    return (await api.get(`/incidents/similar?${query}`)).items
  } catch {
    return [] // never stop someone reporting because the duplicate check didn't answer
  }
}

export default function ReportIncidentPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  // { incidents, resolve } while the "may already be reported" dialog is open
  const [warning, setWarning] = useState(null)

  const askAboutSimilar = (incidents) => new Promise((resolve) => setWarning({ incidents, resolve }))

  const report = async (payload) => {
    const similar = await findSimilar(payload)
    if (similar.length) {
      const choice = await askAboutSimilar(similar)
      setWarning(null)
      if (choice === 'edit') return
      if (choice === 'same') {
        navigate('/', {
          replace: true,
          state: { flash: "Thanks for checking. That problem is already reported, so nothing new was created." },
        })
        return
      }
    }
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
          {isAdmin
            ? "Log a problem you've spotted or been told about. You can assign an engineer from the incident page."
            : "Tell the facilities team what's wrong and where. They'll assign an engineer and keep you updated."}
        </Typography>
      </Stack>
      <IncidentForm
        submitLabel="Report incident"
        priority={isAdmin ? 'set' : 'suggest'}
        onSubmit={report}
        onCancel={() => navigate(-1)}
      />
      <DuplicateWarningDialog
        open={Boolean(warning)}
        incidents={warning?.incidents ?? []}
        onChoose={(choice) => warning?.resolve(choice)}
      />
    </Stack>
  )
}
