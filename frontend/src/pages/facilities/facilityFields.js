/** Form fields for buildings, floors and seats (limits match the backend). */
export const BUILDING_FIELDS = [
  { name: 'name', label: 'Name', required: true, maxLength: 120 },
  { name: 'address', label: 'Address', maxLength: 300, helperText: 'Optional' },
]

export const FLOOR_FIELDS = [
  { name: 'name', label: 'Name', required: true, maxLength: 60, helperText: 'e.g. Ground, Floor 2, Basement' },
  { name: 'level', label: 'Level', type: 'number', required: true, helperText: 'Orders the floors: -1 basement, 0 ground, 1, 2…' },
]

export const SEAT_FIELDS = [
  { name: 'code', label: 'Seat or desk code', required: true, maxLength: 40, helperText: 'e.g. 2A-07' },
]

export function buildingPayload(values) {
  return { name: values.name.trim(), address: values.address.trim() || null }
}

export function floorPayload(values) {
  return { name: values.name.trim(), level: Number(values.level) }
}
