import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { tokenStore } from '../../services/api'
import { apiError, jsonResponse, makeUser, mockApi, renderApp, setScreenWidth, TOKENS } from '../../test/utils'

async function fillAndSubmit(user, email, password) {
  if (email) await user.type(screen.getByLabelText('Work email'), email)
  if (password) await user.type(screen.getByLabelText('Password', { selector: 'input' }), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Login page', () => {
  it('is where signed-out visitors land', async () => {
    mockApi({})
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('checks the fields before calling the API', async () => {
    const fetchMock = mockApi({})
    const user = userEvent.setup()
    renderApp('/login')

    await fillAndSubmit(user)
    expect(screen.getByText('Enter your work email')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Work email'), 'maria')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter an email like jane.doe@acme.inc')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs in and shows the signed-in page', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': jsonResponse(200, { user: makeUser(), tokens: TOKENS }),
    })
    const user = userEvent.setup()
    renderApp('/login')

    await fillAndSubmit(user, '  Maria.Garcia@acme.inc ', 'Password123')

    expect(await screen.findByRole('heading', { name: 'Welcome, Maria' })).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: 'Maria.Garcia@acme.inc', password: 'Password123',
    })
    expect(tokenStore.get()).toEqual(TOKENS)
  })

  it('explains a wrong email or password and keeps what was typed', async () => {
    mockApi({ 'POST /auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password') })
    const user = userEvent.setup()
    renderApp('/login')

    await fillAndSubmit(user, 'maria.garcia@acme.inc', 'wrong-password1')

    expect(await screen.findByRole('alert')).toHaveTextContent("That email and password don't match an account.")
    expect(screen.getByLabelText('Work email')).toHaveValue('maria.garcia@acme.inc')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows the reason when the account is disabled', async () => {
    mockApi({
      'POST /auth/login': apiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact a facility admin.'),
    })
    const user = userEvent.setup()
    renderApp('/login')

    await fillAndSubmit(user, 'chris.taylor@acme.inc', 'Password123')
    expect(await screen.findByRole('alert')).toHaveTextContent('This account has been disabled. Contact a facility admin.')
  })

  it('says so when the server is unreachable or failing', async () => {
    mockApi({ 'POST /auth/login': apiError(503, 'SERVICE_UNAVAILABLE', 'Database unavailable') })
    const user = userEvent.setup()
    renderApp('/login')

    await fillAndSubmit(user, 'maria.garcia@acme.inc', 'Password123')
    expect(await screen.findByRole('alert')).toHaveTextContent('The helpdesk is having trouble right now.')
  })

  it('shows and hides the password', async () => {
    mockApi({})
    const user = userEvent.setup()
    renderApp('/login')
    const password = screen.getByLabelText('Password', { selector: 'input' })

    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('fills in a demo account in local development', async () => {
    mockApi({})
    const user = userEvent.setup()
    renderApp('/login')

    await user.click(screen.getByRole('button', { name: 'Engineer' }))
    expect(screen.getByLabelText('Work email')).toHaveValue('priya.shah@acme.inc')
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveValue('Password123')
  })

  it('links to registration', async () => {
    mockApi({})
    const user = userEvent.setup()
    renderApp('/login')

    await user.click(screen.getByRole('link', { name: 'Create an account' }))
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
  })

  it('shows the brand panel on wide screens only', async () => {
    mockApi({})
    setScreenWidth(1280)
    const { unmount } = renderApp('/login')
    expect(screen.getByText(/Something broken at work\?/)).toBeInTheDocument()
    unmount()

    setScreenWidth(390)
    renderApp('/login')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText(/Something broken at work\?/)).not.toBeInTheDocument()
  })
})

describe('Saved sessions', () => {
  it('restores a saved session without asking to sign in again', async () => {
    mockApi({ 'GET /auth/me': jsonResponse(200, { user: makeUser({ full_name: 'Priya Shah', role: 'engineer' }) }) })
    renderApp('/', { tokens: TOKENS })

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My work' })).toBeInTheDocument()
  })

  it('sends signed-in users away from the sign-in page', async () => {
    mockApi({ 'GET /auth/me': jsonResponse(200, { user: makeUser() }) })
    renderApp('/login', { tokens: TOKENS })
    expect(await screen.findByRole('heading', { name: 'Welcome, Maria' })).toBeInTheDocument()
  })

  it('goes back to sign-in when the saved session was revoked', async () => {
    mockApi({ 'GET /auth/me': apiError(401, 'SESSION_REVOKED', 'Session is no longer valid, please sign in again') })
    renderApp('/', { tokens: TOKENS })

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(tokenStore.get()).toBeNull()
  })

  it('signs out', async () => {
    mockApi({ 'GET /auth/me': jsonResponse(200, { user: makeUser() }) })
    const user = userEvent.setup()
    renderApp('/', { tokens: TOKENS })

    await user.click(await screen.findByRole('button', { name: 'Account menu for Maria Garcia' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    await waitFor(() => expect(tokenStore.get()).toBeNull())
  })
})
