import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { tokenStore } from '../../services/api'
import { apiError, jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const passwordInput = () => screen.getByLabelText('Password', { selector: 'input' })
const confirmInput = () => screen.getByLabelText('Confirm password', { selector: 'input' })

async function fillForm(user, { name = 'Sam Lee', email = 'sam.lee@acme.inc', password = 'Welcome2026', confirm } = {}) {
  if (name) await user.type(screen.getByLabelText('Full name'), name)
  if (email) await user.type(screen.getByLabelText('Work email'), email)
  if (password) await user.type(passwordInput(), password)
  if (confirm ?? password) await user.type(confirmInput(), confirm ?? password)
}

const submit = (user) => user.click(screen.getByRole('button', { name: 'Create account' }))

describe('Register page', () => {
  it('creates an account, signs the person in and opens their dashboard', async () => {
    const fetchMock = mockApi({
      'POST /auth/register': jsonResponse(201, {
        user: makeUser({ full_name: 'Sam Lee', email: 'sam.lee@acme.inc' }), tokens: TOKENS,
      }),
    })
    const user = userEvent.setup()
    renderApp('/register')

    await fillForm(user, { name: '  Sam Lee ' })
    await submit(user)

    expect(await screen.findByRole('heading', { name: 'Welcome, Sam' })).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: 'sam.lee@acme.inc', full_name: 'Sam Lee', password: 'Welcome2026',
    })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
    expect(tokenStore.get()).toEqual(TOKENS)
  })

  it('checks every field before calling the API', async () => {
    const fetchMock = mockApi({})
    const user = userEvent.setup()
    renderApp('/register')

    await submit(user)
    expect(screen.getByText('Enter your name')).toBeInTheDocument()
    expect(screen.getByText('Enter your work email')).toBeInTheDocument()
    expect(screen.getByText('Choose a password')).toBeInTheDocument()
    expect(screen.getByText('Type the password again')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('only accepts @acme.inc emails', async () => {
    const fetchMock = mockApi({})
    const user = userEvent.setup()
    renderApp('/register')

    await fillForm(user, { email: 'sam@gmail.com' })
    await submit(user)
    expect(screen.getByText('Use your @acme.inc work email')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applies the same password rules as the server', async () => {
    const user = userEvent.setup()
    mockApi({})
    renderApp('/register')

    await fillForm(user, { password: 'short1' })
    await submit(user)
    expect(screen.getByText('Password needs: at least 10 characters')).toBeInTheDocument()

    await user.clear(passwordInput())
    await user.clear(confirmInput())
    await fillForm(user, { name: '', email: '', password: 'onlyletters' })
    await submit(user)
    expect(screen.getByText('Password needs: a letter and a number')).toBeInTheDocument()
  })

  it('ticks off the password rules as you type', async () => {
    const user = userEvent.setup()
    mockApi({})
    renderApp('/register')
    const rules = screen.getByRole('list', { name: 'Password rules' })

    expect(within(rules).getByText(/At least 10 characters/)).toHaveTextContent('(not yet)')
    await user.type(passwordInput(), 'Welcome2026')
    expect(within(rules).getByText(/At least 10 characters/)).toHaveTextContent('(done)')
    expect(within(rules).getByText(/A letter and a number/)).toHaveTextContent('(done)')
  })

  it('catches passwords that do not match', async () => {
    const fetchMock = mockApi({})
    const user = userEvent.setup()
    renderApp('/register')

    await fillForm(user, { confirm: 'Welcome2027' })
    await submit(user)
    expect(screen.getByText("The passwords don't match")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says when the email already has an account and offers to sign in', async () => {
    mockApi({
      'POST /auth/register': apiError(409, 'EMAIL_TAKEN', 'An account with this email already exists', { email: 'Already in use' }),
    })
    const user = userEvent.setup()
    renderApp('/register')

    await fillForm(user)
    await submit(user)
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Sign in instead' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it("shows the server's field messages next to the right field", async () => {
    mockApi({
      'POST /auth/register': apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', { full_name: 'Too long' }),
    })
    const user = userEvent.setup()
    renderApp('/register')

    await fillForm(user)
    await submit(user)
    expect(await screen.findByText('Too long')).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('reports server trouble', async () => {
    mockApi({ 'POST /auth/register': apiError(503, 'SERVICE_UNAVAILABLE', 'Database unavailable') })
    const user = userEvent.setup()
    renderApp('/register')

    await fillForm(user)
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('The helpdesk is having trouble right now.')
  })

  it('links back to sign in', async () => {
    mockApi({})
    const user = userEvent.setup()
    renderApp('/register')

    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('sends signed-in users to their dashboard', async () => {
    mockApi({ 'GET /auth/me': jsonResponse(200, { user: makeUser() }) })
    renderApp('/register', { tokens: TOKENS })
    expect(await screen.findByRole('heading', { name: 'Welcome, Maria' })).toBeInTheDocument()
  })
})
