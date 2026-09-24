import { useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment,
  Link, MenuItem, Pagination, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router'

import { EmptyState, PageError, PageLoading } from '../../components/PageStatus'
import { AVAILABILITY_LABELS } from '../../constants/incidents'
import { useApiData } from '../../hooks/useApiData'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import { ROLE_LABELS } from '../../layout/navigation'
import { api } from '../../services/api'
import { timeAgo } from '../../utils/format'
import { mapFieldErrors } from '../../utils/validation'
import TemporaryPasswordDialog from './TemporaryPasswordDialog'
import UserFields from './UserFields'
import { createPayload, EMPTY_USER, USER_API_FIELDS, validateUser } from './userFormValues'

const PAGE_SIZE = 20
const STATUS_FILTERS = { all: 'Everyone', active: 'Active', inactive: 'Deactivated' }

function StatusChip({ user }) {
  if (!user.is_active) return <Chip size="small" label="Deactivated" variant="outlined" />
  if (user.must_change_password) return <Chip size="small" label="Must set password" color="warning" variant="outlined" />
  return <Chip size="small" label="Active" color="success" variant="outlined" />
}

function AddUserDialog({ onClose, onCreated }) {
  const [values, setValues] = useState(EMPTY_USER)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const found = validateUser(values)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      onCreated(await api.post('/users', createPayload(values)))
    } catch (error) {
      const fields = mapFieldErrors(error.fields, USER_API_FIELDS)
      if (error.code === 'EMAIL_TAKEN') fields.email = 'An account with this email already exists'
      setErrors(fields)
      setFormError(Object.keys(fields).length ? null : error.message)
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm" aria-labelledby="add-user-title">
      <form onSubmit={submit} noValidate>
        <DialogTitle id="add-user-title">Add a user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography sx={{ color: 'text.secondary' }}>
              They get a temporary password to share with them, and choose their own when they first sign in.
            </Typography>
            {formError && <Alert severity="error">{formError}</Alert>}
            <UserFields
              values={values}
              errors={errors}
              onChange={(changes) => {
                setValues((v) => ({ ...v, ...changes }))
                setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(changes).map((k) => [k, undefined])) }))
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}>
            Add user
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/** Everyone with an account: search, filter, add. Admin only. */
export default function UsersPage() {
  const { isDesktop } = useBreakpoints()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const filters = {
    q: params.get('q') ?? '',
    role: ROLE_LABELS[params.get('role')] ? params.get('role') : '',
    status: STATUS_FILTERS[params.get('status')] ? params.get('status') : 'all',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
  const [search, setSearch] = useState(filters.q)
  const [adding, setAdding] = useState(false)
  const [created, setCreated] = useState(null)
  const [flash, setFlash] = useState(location.state?.flash ?? null)

  const query = new URLSearchParams({ page: String(filters.page), page_size: String(PAGE_SIZE) })
  if (filters.q) query.set('q', filters.q)
  if (filters.role) query.set('role', filters.role)
  if (filters.status !== 'all') query.set('is_active', String(filters.status === 'active'))
  const { data, error, loading, reload } = useApiData(`/users?${query}`)

  const setFilters = (changes) => {
    const next = { ...filters, page: 1, ...changes }
    const out = new URLSearchParams()
    if (next.q) out.set('q', next.q)
    if (next.role) out.set('role', next.role)
    if (next.status !== 'all') out.set('status', next.status)
    if (next.page > 1) out.set('page', String(next.page))
    setParams(out)
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Typography variant="h2" component="h1">Users</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>Add user</Button>
      </Stack>
      {flash && <Alert severity="success" onClose={() => setFlash(null)}>{flash}</Alert>}

      <Stack
        component="form"
        role="search"
        direction={isDesktop ? 'row' : 'column'}
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault()
          setFilters({ q: search.trim() })
        }}
      >
        <TextField
          id="user-search"
          label="Search"
          placeholder="Name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onBlur={() => search.trim() !== filters.q && setFilters({ q: search.trim() })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ flex: 2 }}
        />
        <TextField select id="role-filter" label="Role" value={filters.role} onChange={(e) => setFilters({ role: e.target.value })} sx={{ flex: 1 }}>
          <MenuItem value="">All roles</MenuItem>
          {Object.entries(ROLE_LABELS).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
        </TextField>
        <TextField select id="status-filter" label="Status" value={filters.status} onChange={(e) => setFilters({ status: e.target.value })} sx={{ flex: 1 }}>
          {Object.entries(STATUS_FILTERS).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
        </TextField>
      </Stack>

      {error && <PageError error={error} onRetry={reload} />}
      {!error && !data && <PageLoading label="Loading users" />}
      {data && data.total === 0 && <EmptyState title="No users match">Try a different search or filter.</EmptyState>}
      {data && data.total > 0 && (
        <Stack spacing={2} sx={{ opacity: loading ? 0.6 : 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} aria-live="polite">
            {data.total === 1 ? '1 user' : `${data.total} users`}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table aria-label="Users">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Role</TableCell>
                  {isDesktop && <TableCell>Status</TableCell>}
                  {isDesktop && <TableCell>Last sign-in</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((u) => (
                  <TableRow key={u.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      <Link component={RouterLink} to={`/users/${u.id}`} underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {u.full_name}
                      </Link>
                      <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{u.email}</Typography>
                      {!isDesktop && <Box sx={{ mt: 0.5 }}><StatusChip user={u} /></Box>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{ROLE_LABELS[u.role]}</Typography>
                      {u.engineer_profile && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {AVAILABILITY_LABELS[u.engineer_profile.availability]}
                        </Typography>
                      )}
                    </TableCell>
                    {isDesktop && <TableCell><StatusChip user={u} /></TableCell>}
                    {isDesktop && (
                      <TableCell sx={{ color: 'text.secondary' }}>{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Pagination count={totalPages} page={filters.page} onChange={(_, page) => setFilters({ page })} color="primary" />
            </Box>
          )}
        </Stack>
      )}

      {adding && (
        <AddUserDialog
          onClose={() => setAdding(false)}
          onCreated={(result) => {
            setAdding(false)
            setCreated(result)
            setFlash(`${result.user.full_name} was added.`)
            reload()
          }}
        />
      )}
      {created && (
        <TemporaryPasswordDialog
          open
          title="Account created"
          person={created.user.full_name}
          password={created.temporary_password}
          onClose={() => setCreated(null)}
        />
      )}
    </Stack>
  )
}
