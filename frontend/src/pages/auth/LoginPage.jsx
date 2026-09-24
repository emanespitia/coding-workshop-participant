import { useState } from 'react'
import { Alert, Button, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import PasswordField from '../../components/PasswordField'
import AuthShell from './AuthShell'
import DemoAccounts from './DemoAccounts'
import { describeAuthError, EMAIL_PATTERN } from '../../utils/validation'

function validate({ email, password }) {
  const errors = {}
  if (!email.trim()) errors.email = 'Enter your work email'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter an email like jane.doe@acme.inc'
  if (!password) errors.password = 'Enter your password'
  return errors
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const [values, setValues] = useState({ email: '', password: '' })
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
      await signIn(values.email.trim(), values.password)
      // Signed in: the /login route redirects to where the user was going.
    } catch (error) {
      setFieldErrors(error.fields || {})
      setFormError(
        error.code === 'INVALID_CREDENTIALS'
          ? "That email and password don't match an account. Check them and try again."
          : describeAuthError(error),
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Sign in" intro="Use your ACME work account to report and track facility issues.">
      <Stack component="form" spacing={2.5} noValidate onSubmit={handleSubmit} aria-label="Sign in">
        {formError && <Alert severity="error">{formError}</Alert>}

        <TextField
          id="email"
          label="Work email"
          type="email"
          autoComplete="username"
          autoFocus
          value={values.email}
          onChange={update('email')}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email || ' '}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          value={values.password}
          onChange={update('password')}
          error={Boolean(fieldErrors.password)}
          helperText={fieldErrors.password || ' '}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Forgot your password? Ask a facility admin to reset it.
        </Typography>
      </Stack>

      <Typography sx={{ color: 'text.secondary' }}>
        New to the helpdesk?{' '}
        <Link component={RouterLink} to="/register" sx={{ fontWeight: 600 }}>Create an account</Link>
      </Typography>

      {import.meta.env.DEV && (
        <DemoAccounts
          onPick={(email, password) => {
            setValues({ email, password })
            setFieldErrors({})
            setFormError(null)
          }}
        />
      )}
    </AuthShell>
  )
}
