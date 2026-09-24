import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { listOf, makeEvent, makeIncident } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const BUILDINGS = listOf([{ id: 1, name: 'HQ Tower' }, { id: 2, name: 'Riverside Annex' }])
const FLOORS = listOf([{ id: 5, name: 'Floor 1', level: 1 }, { id: 6, name: 'Floor 2', level: 2 }])
const SEATS = listOf([{ id: 9, code: '1A-02' }])

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

function mocks(extra = {}) {
  return mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser() }),
    'GET /buildings': jsonResponse(200, BUILDINGS),
    'GET /buildings/1/floors': jsonResponse(200, FLOORS),
    'GET /floors/5/seats': jsonResponse(200, SEATS),
    ...extra,
  })
}

describe('Report an incident', () => {
  it('reports an incident with its location and opens it', async () => {
    const created = makeIncident({ id: 31, title: 'Broken chair' })
    const fetchMock = mocks({
      'POST /incidents': jsonResponse(201, { incident: created }),
      'GET /incidents/31': jsonResponse(200, { incident: created }),
      'GET /incidents/31/notes': jsonResponse(200, { items: [] }),
      'GET /incidents/31/events': jsonResponse(200, { items: [makeEvent()] }),
    })
    const user = userEvent.setup()
    renderApp('/incidents/new', { tokens: TOKENS })

    await screen.findByRole('heading', { name: 'Report an incident' })
    await user.type(screen.getByLabelText(/What's wrong\?/), 'Broken chair')
    await user.type(screen.getByLabelText(/Details/), 'The back rest snapped off.')
    await choose(user, 'Kind of problem', 'Furniture')
    await choose(user, 'How urgent is it?', 'Low')
    await choose(user, 'Building', 'HQ Tower')
    await choose(user, 'Floor', 'Floor 1')
    await choose(user, 'Seat or desk', '1A-02')
    await user.click(screen.getByRole('button', { name: 'Report incident' }))

    expect(await screen.findByText(/your incident has been reported/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Broken chair' })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({
      title: 'Broken chair', description: 'The back rest snapped off.', category: 'furniture', priority: 'low',
      building_id: 1, floor_id: 5, seat_id: 9,
    })
  })

  it('needs a title, details, a kind of problem and a building', async () => {
    const fetchMock = mocks()
    const user = userEvent.setup()
    renderApp('/incidents/new', { tokens: TOKENS })
    await screen.findByRole('heading', { name: 'Report an incident' })

    await user.click(screen.getByRole('button', { name: 'Report incident' }))
    expect(screen.getByText('Give the incident a short title')).toBeInTheDocument()
    expect(screen.getByText('Describe what is wrong')).toBeInTheDocument()
    expect(screen.getByText('Choose the kind of problem')).toBeInTheDocument()
    expect(screen.getByText('Choose the building')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false)
  })

  it('clears the floor and seat when the building changes', async () => {
    mocks({ 'GET /buildings/2/floors': jsonResponse(200, listOf([])) })
    const user = userEvent.setup()
    renderApp('/incidents/new', { tokens: TOKENS })
    await screen.findByRole('heading', { name: 'Report an incident' })

    expect(screen.getByRole('combobox', { name: 'Floor' })).toHaveAttribute('aria-disabled', 'true')
    await choose(user, 'Building', 'HQ Tower')
    await choose(user, 'Floor', 'Floor 2')
    expect(screen.getByRole('combobox', { name: 'Floor' })).toHaveTextContent('Floor 2')

    await choose(user, 'Building', 'Riverside Annex')
    expect(screen.getByRole('combobox', { name: 'Floor' })).not.toHaveTextContent('Floor 2')
    expect(screen.getByRole('combobox', { name: 'Seat or desk' })).toHaveAttribute('aria-disabled', 'true')
  })
})
