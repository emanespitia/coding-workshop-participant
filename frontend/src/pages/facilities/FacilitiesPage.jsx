import { useState } from 'react'
import { Alert, Button, Link, Paper, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'

import FormDialog from '../../components/FormDialog'
import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { BUILDING_FIELDS, buildingPayload } from './facilityFields'

/** Every building, with a link to manage its floors and seats. Admin only. */
export default function FacilitiesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data, error, reload } = useApiData('/buildings')
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState(location.state?.flash ?? null)

  return (
    <Stack spacing={3} sx={{ maxWidth: 860 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Stack spacing={0.5}>
          <Typography variant="h2" component="h1">Facilities</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Buildings, floors and seats people can report problems in.</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>Add building</Button>
      </Stack>
      {flash && <Alert severity="success" onClose={() => setFlash(null)}>{flash}</Alert>}
      {error && <PageError error={error} onRetry={reload} />}
      {!error && !data && <PageLoading label="Loading buildings" />}
      {data && data.items.length === 0 && (
        <EmptyState title="No buildings yet" action={<Button variant="contained" onClick={() => setAdding(true)}>Add building</Button>}>
          Add the buildings, then their floors and seats, so people can say where a problem is.
        </EmptyState>
      )}
      {data && data.items.length > 0 && (
        <Paper variant="outlined" component="ul" aria-label="Buildings" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {data.items.map((b) => (
            <Stack
              component="li"
              key={b.id}
              direction="row"
              spacing={2}
              sx={{
                alignItems: 'center', px: 2.5, py: 2, position: 'relative', borderTop: 1, borderColor: 'divider',
                '&:first-of-type': { borderTop: 0 }, '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Stack spacing={0.25} sx={{ flexGrow: 1, minWidth: 0 }}>
                <Link
                  component={RouterLink}
                  to={`/facilities/${b.id}`}
                  underline="none"
                  sx={{ fontWeight: 600, color: 'text.primary', '&::after': { content: '""', position: 'absolute', inset: 0 } }}
                >
                  {b.name}
                </Link>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[b.address, `${b.floor_count} floor${b.floor_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                </Typography>
              </Stack>
              <ChevronRightIcon sx={{ color: 'text.secondary' }} />
            </Stack>
          ))}
        </Paper>
      )}
      {adding && (
        <FormDialog
          open
          title="Add a building"
          fields={BUILDING_FIELDS}
          submitLabel="Add building"
          onClose={() => setAdding(false)}
          onSubmit={async (values) => {
            const { building } = await api.post('/buildings', buildingPayload(values))
            navigate(`/facilities/${building.id}`, { state: { flash: `${building.name} was added. Now add its floors.` } })
          }}
        />
      )}
    </Stack>
  )
}
