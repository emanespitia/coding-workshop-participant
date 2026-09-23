import { useState } from 'react'
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, IconButton, Link, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router'

import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { BUILDING_FIELDS, buildingPayload, FLOOR_FIELDS, floorPayload, SEAT_FIELDS } from './facilityFields'

/** Seats on one floor: rename or remove each one, plus a quick "add seat" box. */
function Seats({ floor, onCountChange }) {
  const { data, error, reload } = useApiData(`/floors/${floor.id}/seats`)
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState(null)
  const [editing, setEditing] = useState(null)

  const refresh = () => {
    reload()
    onCountChange()
  }

  const add = async (event) => {
    event.preventDefault()
    if (!code.trim()) return
    setProblem(null)
    try {
      await api.post(`/floors/${floor.id}/seats`, { code: code.trim() })
      setCode('')
      refresh()
    } catch (err) {
      setProblem(err.fields?.code || err.message)
    }
  }

  const remove = async (seat) => {
    setProblem(null)
    try {
      await api.delete(`/seats/${seat.id}`)
      refresh()
    } catch (err) {
      setProblem(err.code === 'IN_USE' ? `${seat.code} has incidents reported at it, so it can't be removed.` : err.message)
    }
  }

  if (error) return <PageError error={error} onRetry={reload} />
  if (!data) return <PageLoading label="Loading seats" />

  return (
    <Stack spacing={1.5}>
      {problem && <Alert severity="error" onClose={() => setProblem(null)}>{problem}</Alert>}
      {data.items.length ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }} component="ul" aria-label={`Seats on ${floor.name}`} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {data.items.map((seat) => (
            <Stack
              component="li"
              key={seat.id}
              direction="row"
              sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 99, pl: 0.5 }}
            >
              <Button size="small" onClick={() => setEditing(seat)} aria-label={`Rename seat ${seat.code}`} sx={{ minWidth: 0, borderRadius: 99, color: 'text.primary' }}>
                {seat.code}
              </Button>
              <IconButton size="small" onClick={() => remove(seat)} aria-label={`Remove seat ${seat.code}`}>
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>No seats on this floor yet.</Typography>
      )}
      <Stack component="form" direction="row" spacing={1} onSubmit={add} sx={{ maxWidth: 360 }}>
        <TextField
          size="small"
          id={`new-seat-${floor.id}`}
          label="New seat code"
          placeholder="e.g. 2A-07"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 40 } }}
        />
        <Button type="submit" variant="outlined" sx={{ flexShrink: 0 }}>Add seat</Button>
      </Stack>
      {editing && (
        <FormDialog
          open
          title={`Rename seat ${editing.code}`}
          fields={SEAT_FIELDS}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async ({ code: newCode }) => {
            await api.patch(`/seats/${editing.id}`, { code: newCode.trim() })
            reload()
          }}
        />
      )}
    </Stack>
  )
}

/** One building: its details, floors and seats. Admin only. */
export default function BuildingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { data, error, reload } = useApiData(`/buildings/${id}`)
  const [dialog, setDialog] = useState(null)
  const [problem, setProblem] = useState(null)
  const [flash, setFlash] = useState(location.state?.flash ?? null)
  const [expanded, setExpanded] = useState(null)

  const back = (
    <Link component={RouterLink} to="/facilities" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <ArrowBackIcon fontSize="small" /> Facilities
    </Link>
  )
  if (error) return <Stack spacing={2}>{back}<PageError error={error} onRetry={reload} notFound="This building doesn't exist." /></Stack>
  if (!data) return <PageLoading label="Loading building" />

  const { building } = data

  return (
    <Stack spacing={3} sx={{ maxWidth: 860 }}>
      {back}
      {flash && <Alert severity="success" onClose={() => setFlash(null)}>{flash}</Alert>}
      {problem && <Alert severity="error" onClose={() => setProblem(null)}>{problem}</Alert>}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Stack spacing={0.5}>
          <Typography variant="h2" component="h1">{building.name}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{building.address || 'No address'}</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setDialog({ kind: 'building' })}>Edit</Button>
          <Button color="error" onClick={() => setDialog({ kind: 'delete-building' })}>Delete</Button>
        </Stack>
      </Stack>

      <Stack spacing={1.5} component="section" aria-labelledby="floors-heading">
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography id="floors-heading" variant="h3" component="h2">Floors</Typography>
          <Button startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'floor' })}>Add floor</Button>
        </Stack>
        {building.floors.length === 0 ? (
          <EmptyState title="No floors yet" action={<Button variant="contained" onClick={() => setDialog({ kind: 'floor' })}>Add floor</Button>}>
            Add floors so people can say where in the building a problem is.
          </EmptyState>
        ) : (
          <div>
            {building.floors.map((floor) => (
              <Accordion
                key={floor.id}
                disableGutters
                variant="outlined"
                expanded={expanded === floor.id}
                onChange={(_, open) => setExpanded(open ? floor.id : null)}
                slotProps={{ transition: { unmountOnExit: true } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack>
                    <Typography sx={{ fontWeight: 600 }}>{floor.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Level {floor.level} · {floor.seat_count} seat{floor.seat_count === 1 ? '' : 's'}
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Seats floor={floor} onCountChange={reload} />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => setDialog({ kind: 'floor', floor })}>Edit floor</Button>
                      <Button size="small" color="error" onClick={() => setDialog({ kind: 'delete-floor', floor })}>Delete floor</Button>
                    </Stack>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </div>
        )}
      </Stack>

      {dialog?.kind === 'building' && (
        <FormDialog
          open
          title="Edit building"
          fields={BUILDING_FIELDS}
          initial={{ name: building.name, address: building.address ?? '' }}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await api.patch(`/buildings/${building.id}`, buildingPayload(values))
            reload()
          }}
        />
      )}
      {dialog?.kind === 'floor' && (
        <FormDialog
          open
          title={dialog.floor ? `Edit ${dialog.floor.name}` : 'Add a floor'}
          fields={FLOOR_FIELDS}
          initial={dialog.floor ? { name: dialog.floor.name, level: String(dialog.floor.level) } : {}}
          submitLabel={dialog.floor ? 'Save' : 'Add floor'}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            if (dialog.floor) await api.patch(`/floors/${dialog.floor.id}`, floorPayload(values))
            else await api.post(`/buildings/${building.id}/floors`, floorPayload(values))
            reload()
          }}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'delete-building'}
        title={`Delete ${building.name}?`}
        confirm="Delete building"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          try {
            await api.delete(`/buildings/${building.id}`)
          } catch (err) {
            if (err.code === 'IN_USE') throw new Error(`${building.name} has incidents reported in it, so it can't be deleted.`, { cause: err })
            throw err
          }
          navigate('/facilities', { replace: true, state: { flash: `${building.name} was deleted.` } })
        }}
      >
        Its floors and seats are deleted too. Buildings with incidents reported in them can't be deleted.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === 'delete-floor'}
        title={`Delete ${dialog?.floor?.name ?? 'floor'}?`}
        confirm="Delete floor"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          try {
            await api.delete(`/floors/${dialog.floor.id}`)
          } catch (err) {
            if (err.code === 'IN_USE') throw new Error(`${dialog.floor.name} has incidents reported on it, so it can't be deleted.`, { cause: err })
            throw err
          }
          setProblem(null)
          reload()
        }}
      >
        Its seats are deleted too. Floors with incidents reported on them can't be deleted.
      </ConfirmDialog>
    </Stack>
  )
}
