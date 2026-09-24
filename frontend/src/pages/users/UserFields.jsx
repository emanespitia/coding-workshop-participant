import { MenuItem, Stack, TextField, Typography } from '@mui/material'

import AvailabilityPicker from '../../components/AvailabilityPicker'
import SpecialtyPicker from '../../components/SpecialtyPicker'
import { ROLE_LABELS } from '../../layout/navigation'

/** Name, email, role and (for engineers) the engineer profile. Shared by create and edit. */
export default function UserFields({ values, errors, onChange, lockRole = false, roleHelp }) {
  const set = (name) => (event) => onChange({ [name]: event.target.value })
  return (
    <Stack spacing={2}>
      <TextField
        id="user-name"
        label="Full name"
        required
        value={values.fullName}
        onChange={set('fullName')}
        error={Boolean(errors.fullName)}
        helperText={errors.fullName || ' '}
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />
      <TextField
        id="user-email"
        label="Work email"
        type="email"
        required
        value={values.email}
        onChange={set('email')}
        error={Boolean(errors.email)}
        helperText={errors.email || ' '}
      />
      <TextField
        select
        id="user-role"
        label="Role"
        value={values.role}
        onChange={set('role')}
        disabled={lockRole}
        error={Boolean(errors.role)}
        helperText={errors.role || roleHelp || ' '}
      >
        {Object.entries(ROLE_LABELS).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
      </TextField>
      {values.role === 'engineer' && (
        <Stack spacing={2.5} sx={{ p: 2, borderRadius: 1, bgcolor: 'surface.subtle' }}>
          <SpecialtyPicker
            value={values.specialties}
            onChange={(specialties) => onChange({ specialties })}
            error={errors.specialties}
          />
          <Stack spacing={1}>
            <Typography sx={{ fontWeight: 600 }}>Availability</Typography>
            <AvailabilityPicker value={values.availability} onChange={(availability) => onChange({ availability })} />
          </Stack>
          <TextField
            id="user-phone"
            label="Phone"
            type="tel"
            value={values.phone}
            onChange={set('phone')}
            error={Boolean(errors.phone)}
            helperText={errors.phone || 'Optional'}
            slotProps={{ htmlInput: { maxLength: 30 } }}
          />
        </Stack>
      )}
    </Stack>
  )
}
