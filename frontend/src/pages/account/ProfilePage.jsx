import { useState } from 'react'
import {
  Alert, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material'

import { useAuth } from '../../auth/AuthContext'
import AvailabilityPicker from '../../components/AvailabilityPicker'
import { CATEGORY_LABELS } from '../../constants/incidents'
import { ROLE_LABELS } from '../../layout/navigation'
import { mapFieldErrors } from '../../utils/validation'

const API_FIELDS = { full_name: 'fullName', 'engineer_profile.phone': 'phone', phone: 'phone' }

function formValues(user) {
  return {
    fullName: user.full_name,
    availability: user.engineer_profile?.availability ?? 'available',
    phone: user.engineer_profile?.phone ?? '',
  }
}

/** Your own account: name for everyone; availability and phone for engineers. */
export default function ProfilePage() {
  const { user, updateProfile } = useAuth()
  const isEngineer = user.role === 'engineer'
  const [values, setValues] = useState(() => formValues(user))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const update = (name) => (event) => {
    setValues((v) => ({ ...v, [name]: event.target.value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
    setSaved(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const fullName = values.fullName.trim()
    if (!fullName) {
      setErrors({ fullName: 'Enter your name' })
      return
    }
    const changes = {}
    if (fullName !== user.full_name) changes.full_name = fullName
    if (isEngineer) {
      const profile = {}
      if (values.availability !== user.engineer_profile?.availability) profile.availability = values.availability
      if (values.phone.trim() !== (user.engineer_profile?.phone ?? '')) profile.phone = values.phone.trim() || null
      if (Object.keys(profile).length) changes.engineer_profile = profile
    }
    if (!Object.keys(changes).length) {
      setSaved(true)
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const updated = await updateProfile(changes)
      setValues(formValues(updated))
      setSaved(true)
    } catch (error) {
      const fields = mapFieldErrors(error.fields, API_FIELDS)
      setErrors(fields)
      setFormError(Object.keys(fields).length ? null : error.message)
    }
    setSaving(false)
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Typography variant="h2" component="h1">My profile</Typography>
      {saved && <Alert severity="success">Your profile is up to date.</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack component="form" spacing={3} noValidate onSubmit={handleSubmit} aria-label="My profile">
          {formError && <Alert severity="error">{formError}</Alert>}

          <Stack spacing={2}>
            <TextField
              id="full-name"
              label="Full name"
              autoComplete="name"
              value={values.fullName}
              onChange={update('fullName')}
              error={Boolean(errors.fullName)}
              helperText={errors.fullName || ' '}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Stack spacing={0.25}>
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>Email</Typography>
                <Typography>{user.email}</Typography>
              </Stack>
              <Stack spacing={0.25}>
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>Role</Typography>
                <Typography>{ROLE_LABELS[user.role]}</Typography>
              </Stack>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Only a facility admin can change your email or role.
            </Typography>
          </Stack>

          {isEngineer && (
            <>
              <Divider />
              <Stack spacing={2.5}>
                <Typography variant="h3" component="h2">Engineer details</Typography>
                <Stack spacing={1}>
                  <Typography id="availability-label" sx={{ fontWeight: 600 }}>Availability</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Admins see this when choosing who to assign.
                  </Typography>
                  <AvailabilityPicker
                    value={values.availability}
                    onChange={(availability) => {
                      setValues((v) => ({ ...v, availability }))
                      setSaved(false)
                    }}
                  />
                </Stack>
                <TextField
                  id="phone"
                  label="Phone"
                  type="tel"
                  autoComplete="tel"
                  value={values.phone}
                  onChange={update('phone')}
                  error={Boolean(errors.phone)}
                  helperText={errors.phone || 'Optional. Shown to admins so they can reach you.'}
                  slotProps={{ htmlInput: { maxLength: 30 } }}
                />
                <Stack spacing={1}>
                  <Typography sx={{ fontWeight: 600 }}>Specialties</Typography>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }} aria-label="Specialties">
                    {user.engineer_profile.specialties.map((key) => (
                      <Chip key={key} label={CATEGORY_LABELS[key] ?? key} variant="outlined" />
                    ))}
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    The kinds of problems you work on. Ask a facility admin to change them.
                  </Typography>
                </Stack>
              </Stack>
            </>
          )}

          <Stack direction="row">
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
            >
              Save changes
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
