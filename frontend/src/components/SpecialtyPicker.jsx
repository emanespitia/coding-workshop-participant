import { Chip, FormHelperText, Stack, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'

import { CATEGORY_LABELS } from '../constants/incidents'

/** Pick the kinds of problems an engineer works on (at least one). */
export default function SpecialtyPicker({ value, onChange, error }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key])
  return (
    <Stack spacing={1} role="group" aria-labelledby="specialties-label">
      <Typography id="specialties-label" sx={{ fontWeight: 600 }}>Specialties</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
          const on = value.includes(key)
          return (
            <Chip
              key={key}
              label={label}
              icon={on ? <CheckIcon /> : undefined}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              aria-pressed={on}
              onClick={() => toggle(key)}
            />
          )
        })}
      </Stack>
      <FormHelperText error={Boolean(error)} sx={{ mx: 0 }}>
        {error || 'The kinds of problems they can be assigned. Choose at least one.'}
      </FormHelperText>
    </Stack>
  )
}
