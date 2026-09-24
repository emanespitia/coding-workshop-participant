import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { tokenStore } from '../../services/api'
import { listOf, makeSummary } from '../../test/fixtures'
import { apiError, jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const NEW_TOKENS = { ...TOKENS, access_token: 'access-new', refresh_token: 'refresh-new' }
const field = (label) => screen.getByLabelText(label, { selector: 'input' })

async function fill(user, { current = 'Password123', next = 'NewPassword2026', confirm } = {}) {
  if (current) await user.type(field('Current password'), current)
  if (next) await user.type(field('New password'), next)
  if (confirm ?? next) await user.type(field('Confirm new password'), confirm ?? next)
  await user.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('Change password', () => {
  it('changes the password and keeps the user signed in with the new session', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser() }),
      'PUT /auth/password': jsonResponse(200, { user: makeUser(), tokens: NEW_TOKENS }),
    })
    const user = userEvent.setup()
    renderApp('/account/password', { tokens: TOKENS })

    await screen.findByRole('heading', { name: 'Change password' })
    await fill(user)

    expect(await screen.findByText('Your password has been changed.')).toBeInTheDocument()
    const put = fetchMock.mock.calls.find(([, init]) => init.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ current_password: 'Password123', new_password: 'NewPassword2026' })
    expect(tokenStore.get()).toEqual(NEW_TOKENS)
    expect(field('Current password')).toHaveValue('')
  })

  it('checks the fields first', async () => {
    const fetchMock = mockApi({ 'GET /auth/me': jsonResponse(200, { user: makeUser() }) })
    const user = userEvent.setup()
    renderApp('/account/password', { tokens: TOKENS })
    await screen.findByRole('heading', { name: 'Change password' })

    await fill(user, { current: 'Password123', next: 'Password123' })
    expect(screen.getByText('Choose a password different from your current one')).toBeInTheDocument()

    await user.clear(field('New password'))
    await user.clear(field('Confirm new password'))
    await fill(user, { current: '', next: 'NewPassword2026', confirm: 'Different2026' })
    expect(screen.getByText("The passwords don't match")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // only /auth/me
  })

  it('shows a wrong current password on that field', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser() }),
      'PUT /auth/password': apiError(400, 'VALIDATION_ERROR', 'Validation failed', {
        current_password: 'Current password is incorrect',
      }),
    })
    const user = userEvent.setup()
    renderApp('/account/password', { tokens: TOKENS })
    await screen.findByRole('heading', { name: 'Change password' })

    await fill(user, { current: 'WrongPassword1' })
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(field('Current password')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Required password change', () => {
  const newHire = makeUser({ full_name: 'Nina Patel', email: 'nina.patel@acme.inc', must_change_password: true })

  it('sends the user to change their password before anything else', async () => {
    mockApi({ 'GET /auth/me': jsonResponse(200, { user: newHire }) })
    renderApp('/incidents', { tokens: TOKENS })

    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByText(/Choose a new password to continue/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('opens the dashboard once the new password is set', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: newHire }),
      'PUT /auth/password': jsonResponse(200, { user: { ...newHire, must_change_password: false }, tokens: NEW_TOKENS }),
      'GET /reports/summary': jsonResponse(200, makeSummary({ totals: { ...makeSummary().totals, total: 0 } })),
      'GET /incidents': jsonResponse(200, listOf([])),
    })
    const user = userEvent.setup()
    renderApp('/', { tokens: TOKENS })

    await screen.findByRole('heading', { name: 'Change password' })
    await fill(user, { current: 'TempPass123' })

    expect(await screen.findByRole('heading', { name: 'Hi, Nina' })).toBeInTheDocument()
    expect(screen.getByText('Your new password is set. Welcome!')).toBeInTheDocument()
  })
})
