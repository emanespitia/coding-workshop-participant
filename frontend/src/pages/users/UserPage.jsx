import { useState } from 'react'
import {
  Alert, Button, CircularProgress, Divider, FormControlLabel, Link, Paper, Stack, Switch, Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import ConfirmDialog from '../../components/ConfirmDialog'
import { PageError, PageLoading } from '../../components/PageStatus'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { formatDateTime } from '../../utils/format'
import { mapFieldErrors } from '../../utils/validation'
import TemporaryPasswordDialog from './TemporaryPasswordDialog'
import UserFields from './UserFields'
import { updatePayload, USER_API_FIELDS, userToForm, validateUser } from './userFormValues'

function EditForm({ person, isSelf, onSaved }) {
  const [values, setValues] = useState(() => userToForm(person))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const found = validateUser(values)
    setErrors(found)
    setFormError(null)
    setSaved(false)
    if (Object.keys(found).length) return
    const body = updatePayload(values, person)
    if (!Object.keys(body).length) {
      setSaved(true)
      return
    }
    setBusy(true)
    try {
      const { user } = await api.patch(`/users/${person.id}`, body)
      setValues(userToForm(user))
      setSaved(true)
      onSaved(user)
    } catch (error) {
      const fields = mapFieldErrors(error.fields, USER_API_FIELDS)
      if (error.code === 'EMAIL_TAKEN') fields.email = 'An account with this email already exists'
      setErrors(fields)
      setFormError(Object.keys(fields).length ? null : error.message)
    }
    setBusy(false)
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack component="form" spacing={2} noValidate onSubmit={submit} aria-label="Edit user">
        {saved && <Alert severity="success">Changes saved.</Alert>}
        {formError && <Alert severity="error">{formError}</Alert>}
        <UserFields
          values={values}
          errors={errors}
          lockRole={isSelf}
          roleHelp={isSelf ? "You can't change your own role." : values.role !== person.role && person.role === 'engineer'
            ? 'Their open incidents must be reassigned first; pending requests are withdrawn.' : undefined}
          onChange={(changes) => {
            setValues((v) => ({ ...v, ...changes }))
            setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(changes).map((k) => [k, undefined])) }))
            setSaved(false)
          }}
        />
        <FormControlLabel
          control={(
            <Switch
              checked={values.isActive}
              disabled={isSelf}
              onChange={(event) => {
                setValues((v) => ({ ...v, isActive: event.target.checked }))
                setSaved(false)
              }}
            />
          )}
          label={values.isActive ? 'Account active' : 'Account deactivated (cannot sign in)'}
        />
        <Stack direction="row">
          <Button type="submit" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}>
            Save changes
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}

/** One user's account: details, role, engineer profile, password reset, delete. Admin only. */
export default function UserPage() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const { data, error, reload, setData } = useApiData(`/users/${id}`)
  const [dialog, setDialog] = useState(null)
  const [tempPassword, setTempPassword] = useState(null)

  const back = (
    <Link component={RouterLink} to="/users" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <ArrowBackIcon fontSize="small" /> Users
    </Link>
  )
  if (error) return <Stack spacing={2}>{back}<PageError error={error} onRetry={reload} notFound="This user doesn't exist." /></Stack>
  if (!data) return <PageLoading label="Loading user" />

  const person = data.user
  const isSelf = person.id === me.id

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      {back}
      <Stack spacing={0.5}>
        <Typography variant="h2" component="h1">{person.full_name}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Joined {formatDateTime(person.created_at)} · last signed in {person.last_login_at ? formatDateTime(person.last_login_at) : 'never'}
        </Typography>
      </Stack>
      {isSelf && <Alert severity="info">This is your own account. Another admin has to change your role or deactivate you.</Alert>}
      {person.must_change_password && <Alert severity="warning">They'll be asked to choose a new password when they next sign in.</Alert>}

      <EditForm key={person.updated_at} person={person} isSelf={isSelf} onSaved={(user) => setData({ user })} />

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2} divider={<Divider flexItem />}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Stack spacing={0.25}>
              <Typography sx={{ fontWeight: 600 }}>Reset password</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Signs them out everywhere and gives you a temporary password to share.
              </Typography>
            </Stack>
            <Button variant="outlined" onClick={() => setDialog('reset')}>Reset password</Button>
          </Stack>
          {!isSelf && (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Stack spacing={0.25}>
                <Typography sx={{ fontWeight: 600 }}>Delete account</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Only for accounts with no incidents, notes or requests. Otherwise deactivate them above.
                </Typography>
              </Stack>
              <Button color="error" onClick={() => setDialog('delete')}>Delete</Button>
            </Stack>
          )}
        </Stack>
      </Paper>

      <ConfirmDialog
        open={dialog === 'reset'}
        title={`Reset ${person.full_name}'s password?`}
        confirm="Reset password"
        color="primary"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const result = await api.post(`/users/${person.id}/reset-password`)
          setTempPassword(result.temporary_password)
          reload()
        }}
      >
        They'll be signed out on every device and must choose a new password with the temporary one.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        title={`Delete ${person.full_name}?`}
        confirm="Delete account"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          try {
            await api.delete(`/users/${person.id}`)
          } catch (err) {
            if (err.code === 'USER_HAS_HISTORY') {
              throw new Error(`${person.full_name} has incidents, notes or requests, so the account can't be deleted. Deactivate it instead.`, { cause: err })
            }
            throw err
          }
          navigate('/users', { replace: true, state: { flash: `${person.full_name} was deleted.` } })
        }}
      >
        This permanently removes the account.
      </ConfirmDialog>
      {tempPassword && (
        <TemporaryPasswordDialog
          open
          title="Password reset"
          person={person.full_name}
          password={tempPassword}
          onClose={() => setTempPassword(null)}
        />
      )}
    </Stack>
  )
}
