import { ToggleButton, ToggleButtonGroup } from '@mui/material'

import { AVAILABILITY_LABELS } from '../constants/incidents'

/** Available / Busy / Off duty, as a row of toggle buttons. */
export default function AvailabilityPicker({ value, onChange, disabled, size = 'small', label = 'Availability' }) {
  return (
    <ToggleButtonGroup
      exclusive
      size={size}
      color="primary"
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(_, next) => next && next !== value && onChange(next)}
    >
      {Object.entries(AVAILABILITY_LABELS).map(([key, text]) => (
        <ToggleButton key={key} value={key} sx={{ px: 1.75 }}>{text}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
