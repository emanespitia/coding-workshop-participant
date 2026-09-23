import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENGINEER_USER } from '../../test/fixtures'
import { apiError, jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const engineer = makeUser(ENGINEER_USER)

function open(user, extra = {}) {
  const fetchMock = mockApi({ 'GET /auth/me': jsonResponse(200, { user }), ...extra })
  renderApp('/account/profile', { tokens: TOKENS })
  return fetchMock
}

const patchBody = (fetchMock) => JSON.parse(fetchMock.mock.calls.find(([, i]) => i.method === 'PATCH')[1].body)

describe('My profile', () => {
  it('lets an employee change their name only', async () => {
    const fetchMock = open(makeUser(), {
      'PATCH /users/7': jsonResponse(200, { user: makeUser({ full_name: 'Maria G. Garcia' }) }),
    })
    const user = userEvent.setup()

    const name = await screen.findByLabelText('Full name')
    expect(screen.getByText('maria.garcia@acme.inc')).toBeInTheDocument()
    expect(screen.queryByText('Engineer details')).not.toBeInTheDocument()

    await user.clear(name)
    await user.type(name, 'Maria G. Garcia')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Your profile is up to date.')).toBeInTheDocument()
    expect(patchBody(fetchMock)).toEqual({ full_name: 'Maria G. Garcia' })
    expect(screen.getByRole('button', { name: 'Account menu for Maria G. Garcia' })).toBeInTheDocument()
  })

  it('lets an engineer set availability and phone, and shows specialties read-only', async () => {
    const updated = { ...engineer, engineer_profile: { ...engineer.engineer_profile, availability: 'busy', phone: null } }
    const fetchMock = open(engineer, { 'PATCH /users/3': jsonResponse(200, { user: updated }) })
    const user = userEvent.setup()

    await screen.findByText('Engineer details')
    const specialties = screen.getByLabelText('Specialties')
    expect(within(specialties).getByText('Network & Wi-Fi')).toBeInTheDocument()
    expect(within(specialties).getByText('IT hardware')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Busy' }))
    await user.clear(screen.getByLabelText('Phone'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Your profile is up to date.')).toBeInTheDocument()
    expect(patchBody(fetchMock)).toEqual({ engineer_profile: { availability: 'busy', phone: null } })
    expect(screen.getByRole('button', { name: 'Busy' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("doesn't call the API when nothing changed", async () => {
    const fetchMock = open(makeUser())
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Your profile is up to date.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, i]) => i.method === 'PATCH')).toBe(false)
  })

  it('shows server field errors', async () => {
    open(makeUser(), {
      'PATCH /users/7': apiError(400, 'VALIDATION_ERROR', 'Validation failed', { full_name: 'Too long' }),
    })
    const user = userEvent.setup()
    const name = await screen.findByLabelText('Full name')
    await user.type(name, 'x')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Too long')).toBeInTheDocument()
  })

  it('is in the account menu', async () => {
    open(makeUser(), { 'GET /reports/summary': apiError(500, 'X', 'x') })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Account menu for Maria Garcia' }))
    await user.click(screen.getByRole('menuitem', { name: 'My profile' }))
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument()
  })
})
