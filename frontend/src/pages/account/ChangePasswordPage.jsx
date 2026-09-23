import { useState } from 'react'
import { Alert, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { useNavigate } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import PasswordField from '../../components/PasswordField'
import PasswordRules from '../../components/PasswordRules'
import { describeAuthError, mapFieldErrors, passwordError } from '../../utils/validation'

const EMPTY = { current: '', next: '', confirm: '' }
const API_FIELDS = { current_password: 'current', new_password: 'next' }

function validate({ current, next, confirm }) {
  const errors = {}
  if (!current) errors.current = 'Enter your current password'
  const badPassword = passwordError(next)
  if (badPassword) errors.next = badPassword
  else if (next === current) errors.next = 'Choose a password different from your current one'
  if (!confirm) errors.confirm = 'Type the new password again'
  else if (confirm !== next) errors.confirm = "The passwords don't match"
  return errors
}

export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth()
  const navigate = useNavigate()
  const mustChange = user.must_change_password
  const [values, setValues] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const update = (name) => (event) => {
    setValues((v) => ({ ...v, [name]: event.target.value }))
    setFieldErrors((e) => ({ ...e, [name]: undefined }))
    setSaved(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const errors = validate(values)
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      await changePassword(values.current, values.next)
      setValues(EMPTY)
      setSubmitting(false)
      if (mustChange) navigate('/', { replace: true, state: { flash: 'Your new password is set. Welcome!' } })
      else setSaved(true)
    } catch (error) {
      const fields = mapFieldErrors(error.fields, API_FIELDS)
      setFieldErrors(fields)
      setFormError(Object.keys(fields).length ? null : describeAuthError(error))
      setSubmitting(false)
    }
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 520 }}>
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">Change password</Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          Changing your password signs you out on your other devices.
        </Typography>
      </Stack>

      {mustChange && (
        <Alert severity="warning">
          Choose a new password to continue. Your account was set up or reset by a facility admin, so the
          password you signed in with was only temporary.
        </Alert>
      )}
      {saved && <Alert severity="success">Your password has been changed.</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack component="form" spacing={2.5} noValidate onSubmit={handleSubmit} aria-label="Change password">
          {formError && <Alert severity="error">{formError}</Alert>}
          <PasswordField
            id="current-password"
            label="Current password"
            autoComplete="current-password"
            value={values.current}
            onChange={update('current')}
            error={Boolean(fieldErrors.current)}
            helperText={fieldErrors.current || ' '}
          />
          <Stack spacing={1}>
            <PasswordField
              id="new-password"
              label="New password"
              autoComplete="new-password"
              value={values.next}
              onChange={update('next')}
              error={Boolean(fieldErrors.next)}
              helperText={fieldErrors.next}
            />
            <PasswordRules password={values.next} />
          </Stack>
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={values.confirm}
            onChange={update('confirm')}
            error={Boolean(fieldErrors.confirm)}
            helperText={fieldErrors.confirm || ' '}
          />
          <Stack direction="row" spacing={1.5}>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
            >
              {submitting ? 'Saving…' : 'Change password'}
            </Button>
            {!mustChange && (
              <Button variant="text" onClick={() => navigate(-1)}>Cancel</Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
