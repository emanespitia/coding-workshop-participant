import { MenuItem, Stack, TextField } from '@mui/material'

import { useApiData } from '../../hooks/useApiData'

/**
 * Building → floor → seat pickers. Floor and seat are optional; choosing a different
 * building clears the floor and seat, and a different floor clears the seat.
 */
export default function LocationFields({ value, onChange, errors = {}, stacked }) {
  const { building_id: buildingId, floor_id: floorId, seat_id: seatId } = value
  const buildings = useApiData('/buildings')
  const floors = useApiData(buildingId ? `/buildings/${buildingId}/floors` : null)
  const seats = useApiData(floorId ? `/floors/${floorId}/seats` : null)

  const set = (changes) => onChange({ ...value, ...changes })

  return (
    <Stack direction={stacked ? 'column' : 'row'} spacing={2}>
      <TextField
        select
        id="building"
        label="Building"
        required
        value={buildings.data ? buildingId : ''}
        onChange={(event) => set({ building_id: event.target.value, floor_id: '', seat_id: '' })}
        error={Boolean(errors.building_id || buildings.error)}
        helperText={errors.building_id || (buildings.error ? "Couldn't load buildings" : ' ')}
        disabled={!buildings.data}
      >
        {(buildings.data?.items ?? []).map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
      </TextField>

      <TextField
        select
        id="floor"
        label="Floor"
        value={floors.data ? floorId : ''}
        onChange={(event) => set({ floor_id: event.target.value, seat_id: '' })}
        error={Boolean(errors.floor_id)}
        helperText={errors.floor_id || (buildingId ? 'Optional' : 'Choose a building first')}
        disabled={!buildingId || !floors.data}
      >
        <MenuItem value=""><em>Not sure / whole building</em></MenuItem>
        {(floors.data?.items ?? []).map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
      </TextField>

      <TextField
        select
        id="seat"
        label="Seat or desk"
        value={seats.data ? seatId : ''}
        onChange={(event) => set({ seat_id: event.target.value })}
        error={Boolean(errors.seat_id)}
        helperText={errors.seat_id || (floorId ? 'Optional' : 'Choose a floor first')}
        disabled={!floorId || !seats.data}
      >
        <MenuItem value=""><em>No specific seat</em></MenuItem>
        {(seats.data?.items ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.code}</MenuItem>)}
      </TextField>
    </Stack>
  )
}
