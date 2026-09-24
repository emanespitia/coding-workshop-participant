import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ADMIN_USER, ENGINEER_USER } from '../../test/fixtures'
import { apiError, jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'
import { updatePayload, userToForm } from './userFormValues'

const admin = makeUser(ADMIN_USER)
const maria = makeUser()
const priya = makeUser(ENGINEER_USER)
const page = (items) => ({ items, total: items.length, page: 1, page_size: 20 })
const sent = (fetchMock, method, path) => {
  const call = fetchMock.mock.calls.find(([url, i]) => i.method === method && url.endsWith(path))
  return call && JSON.parse(call[1].body ?? 'null')
}

describe('Users list', () => {
  it('lists users and filters by role and status', async () => {
    const queries = []
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: admin }),
      'GET /users': (req) => {
        queries.push(req.query)
        return jsonResponse(200, page([maria, priya, makeUser({ id: 9, full_name: 'Chris Taylor', is_active: false })]))
      },
    })
    const user = userEvent.setup()
    renderApp('/users', { tokens: TOKENS })

    const table = await screen.findByRole('table', { name: 'Users' })
    expect(within(table).getByRole('link', { name: 'Priya Shah' })).toHaveAttribute('href', '/users/3')
    expect(within(table).getByText('Deactivated')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Role' }))
    await user.click(await screen.findByRole('option', { name: 'Engineer' }))
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Active' }))
    expect(queries.at(-1).get('role')).toBe('engineer')
    expect(queries.at(-1).get('is_active')).toBe('true')
  })

  it('adds an engineer (specialties required) and shows the temporary password once', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: admin }),
      'GET /users': jsonResponse(200, page([maria])),
      'POST /users': jsonResponse(201, { user: makeUser({ id: 30, full_name: 'Ava Stone', role: 'engineer' }), temporary_password: 'Temp-7x9Qk2' }),
    })
    const user = userEvent.setup()
    renderApp('/users', { tokens: TOKENS })

    await user.click(await screen.findByRole('button', { name: 'Add user' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a user' })
    await user.type(within(dialog).getByLabelText(/Full name/), 'Ava Stone')
    await user.type(within(dialog).getByLabelText(/Work email/), 'ava.stone@acme.inc')
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    await user.click(await screen.findByRole('option', { name: 'Engineer' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }))
    expect(within(dialog).getByText('Choose at least one specialty')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Plumbing' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }))

    const shown = await screen.findByRole('dialog', { name: 'Account created' })
    expect(within(shown).getByLabelText('Temporary password')).toHaveTextContent('Temp-7x9Qk2')
    expect(sent(fetchMock, 'POST', '/users')).toEqual({
      email: 'ava.stone@acme.inc', full_name: 'Ava Stone', role: 'engineer',
      engineer_profile: { specialties: ['plumbing'], availability: 'available', phone: null },
    })
    await user.click(within(shown).getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Ava Stone was added.')).toBeInTheDocument()
  })
})

describe('User page', () => {
  function open(person, extra = {}) {
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: admin }),
      [`GET /users/${person.id}`]: jsonResponse(200, { user: person }),
      ...extra,
    })
    renderApp(`/users/${person.id}`, { tokens: TOKENS })
    return fetchMock
  }

  it('saves only what changed', async () => {
    const fetchMock = open(priya, { 'PATCH /users/3': jsonResponse(200, { user: { ...priya, full_name: 'Priya S.' } }) })
    const user = userEvent.setup()

    const name = await screen.findByLabelText(/Full name/)
    await user.clear(name)
    await user.type(name, 'Priya S.')
    await user.click(screen.getByRole('button', { name: 'Plumbing' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    expect(sent(fetchMock, 'PATCH', '/users/3')).toEqual({
      full_name: 'Priya S.',
      engineer_profile: { specialties: ['network', 'it_hardware', 'plumbing'], availability: 'available', phone: '555-0102' },
    })
  })

  it('shows the server message when an engineer still has open incidents', async () => {
    open(priya, {
      'PATCH /users/3': apiError(409, 'ENGINEER_HAS_OPEN_INCIDENTS', "Reassign this engineer's open incidents first: #3, #14"),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('switch'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText("Reassign this engineer's open incidents first: #3, #14")).toBeInTheDocument()
  })

  it('resets the password and shows the temporary one', async () => {
    const fetchMock = open(maria, { 'POST /users/7/reset-password': jsonResponse(200, { temporary_password: 'Reset-4tW8' }) })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Reset password' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset password' }))
    const shown = await screen.findByRole('dialog', { name: 'Password reset' })
    expect(within(shown).getByLabelText('Temporary password')).toHaveTextContent('Reset-4tW8')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/users/7/reset-password'))).toBe(true)
  })

  it('suggests deactivating when the account has history', async () => {
    open(maria, {
      'DELETE /users/7': apiError(409, 'USER_HAS_HISTORY', 'This user has related records and cannot be deleted; deactivate the account instead'),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByText(/Deactivate it instead/)).toBeInTheDocument()
  })

  it("doesn't let admins change their own role, deactivate or delete themselves", async () => {
    open(admin)
    expect(await screen.findByText(/This is your own account/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

describe('updatePayload', () => {
  it('sends the full engineer profile when someone becomes an engineer', () => {
    const values = { ...userToForm(maria), role: 'engineer', specialties: ['hvac'] }
    expect(updatePayload(values, maria)).toEqual({
      role: 'engineer', engineer_profile: { specialties: ['hvac'], availability: 'available', phone: null },
    })
  })

  it('sends nothing when nothing changed', () => {
    expect(updatePayload(userToForm(priya), priya)).toEqual({})
  })
})
