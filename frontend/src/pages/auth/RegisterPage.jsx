import { useState } from 'react'
import { Alert, Button, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import PasswordField from '../../components/PasswordField'
import PasswordRules from '../../components/PasswordRules'
import AuthShell from './AuthShell'
import { describeAuthError, EMAIL_DOMAIN, EMAIL_PATTERN, mapFieldErrors, passwordError } from '../../utils/validation'

const EMPTY = { fullName: '', email: '', password: '', confirm: '' }

function validate({ fullName, email, password, confirm }) {
  const errors = {}
  if (!fullName.trim()) errors.fullName = 'Enter your name'
  else if (fullName.trim().length > 120) errors.fullName = 'Use 120 characters or fewer'

  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) errors.email = 'Enter your work email'
  else if (!EMAIL_PATTERN.test(cleanEmail)) errors.email = 'Enter an email like jane.doe@acme.inc'
  else if (!cleanEmail.endsWith(`@${EMAIL_DOMAIN}`)) errors.email = `Use your @${EMAIL_DOMAIN} work email`

  const badPassword = passwordError(password)
  if (badPassword) errors.password = badPassword

  if (!confirm) errors.confirm = 'Type the password again'
  else if (confirm !== password) errors.confirm = "The passwords don't match"
  return errors
}

// The API names fields in snake_case.
const API_FIELDS = { full_name: 'fullName', email: 'email', password: 'password' }

export default function RegisterPage() {
  const { register } = useAuth()
  const [values, setValues] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const update = (name) => (event) => {
    setValues((v) => ({ ...v, [name]: event.target.value }))
    setFieldErrors((e) => ({ ...e, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const errors = validate(values)
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      await register({ fullName: values.fullName.trim(), email: values.email.trim(), password: values.password })
      // Signed in: the /register route redirects to the dashboard.
    } catch (error) {
      const fields = mapFieldErrors(error.fields, API_FIELDS)
      if (error.code === 'EMAIL_TAKEN') fields.email = 'An account with this email already exists'
      setFieldErrors(fields)
      setFormError(Object.keys(fields).length ? null : describeAuthError(error))
      setSubmitting(false)
    }
  }

  const emailTaken = fieldErrors.email === 'An account with this email already exists'

  return (
    <AuthShell
      title="Create your account"
      intro="For ACME staff. You'll be able to report facility issues and follow them until they're fixed."
    >
      <Stack component="form" spacing={2.5} noValidate onSubmit={handleSubmit} aria-label="Create your account">
        {formError && <Alert severity="error">{formError}</Alert>}
        {emailTaken && (
          <Alert severity="info">
            Already registered?{' '}
            <Link component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>Sign in instead</Link>
          </Alert>
        )}

        <TextField
          id="fullName"
          label="Full name"
          autoComplete="name"
          autoFocus
          value={values.fullName}
          onChange={update('fullName')}
          error={Boolean(fieldErrors.fullName)}
          helperText={fieldErrors.fullName || ' '}
        />
        <TextField
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={update('email')}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email || `Must end in @${EMAIL_DOMAIN}`}
        />
        <Stack spacing={1}>
          <PasswordField
            id="password"
            label="Password"
            autoComplete="new-password"
            value={values.password}
            onChange={update('password')}
            error={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password}
          />
          <PasswordRules password={values.password} />
        </Stack>
        <PasswordField
          id="confirm"
          label="Confirm password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={update('confirm')}
          error={Boolean(fieldErrors.confirm)}
          helperText={fieldErrors.confirm || ' '}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {submitting ? 'Creating your account…' : 'Create account'}
        </Button>
      </Stack>

      <Typography sx={{ color: 'text.secondary' }}>
        Already have an account?{' '}
        <Link component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>Sign in</Link>
      </Typography>
    </AuthShell>
  )
}
