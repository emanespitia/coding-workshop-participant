import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENGINEER_USER, listOf, makeIncident, makeRequest } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const WAITING = [
  makeIncident({ id: 2, title: 'Projector won’t turn on', category: 'av_equipment' }),
  makeIncident({ id: 13, title: 'Wi-Fi drops in the lobby', category: 'network' }),
]

function open({ pending = [], extra = {} } = {}) {
  const queries = []
  const fetchMock = mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser(ENGINEER_USER) }),
    'GET /incidents': (req) => {
      queries.push(req.query)
      return jsonResponse(200, listOf(WAITING))
    },
    'GET /assignment-requests': jsonResponse(200, { items: pending }),
    ...extra,
  })
  renderApp('/incidents/available', { tokens: TOKENS })
  return { fetchMock, queries }
}

describe('Available incidents', () => {
  it('shows open, unassigned incidents in my specialties, most urgent first', async () => {
    const { queries } = open()
    await screen.findByRole('table', { name: 'Incidents' })
    expect(Object.fromEntries(queries[0])).toMatchObject({
      scope: 'available', sort: '-priority', category: 'network,it_hardware',
    })
    expect(screen.getByText('2 incidents waiting')).toBeInTheDocument()
  })

  it('can show everything that is waiting', async () => {
    const { queries } = open()
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Incidents' })
    await user.click(screen.getByRole('switch', { name: /Only my specialties/ }))
    expect(queries.at(-1).has('category')).toBe(false)
  })

  it('sends a request with an optional message', async () => {
    const { fetchMock } = open({ extra: { 'POST /incidents/13/assignment-requests': jsonResponse(201, { request: makeRequest() }) } })
    const user = userEvent.setup()
    const table = await screen.findByRole('table', { name: 'Incidents' })
    const row = within(table).getByRole('link', { name: 'Wi-Fi drops in the lobby' }).closest('tr')

    await user.click(within(row).getByRole('button', { name: 'Request to take' }))
    const dialog = screen.getByRole('dialog', { name: 'Ask to take #13?' })
    await user.type(within(dialog).getByLabelText(/Message for the admin/), 'On site today')
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }))

    await screen.findByRole('table', { name: 'Incidents' })
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')
    expect(post[0]).toBe('/api/helpdesk/incidents/13/assignment-requests')
    expect(JSON.parse(post[1].body)).toEqual({ message: 'On site today' })
  })

  it('shows pending requests and lets me withdraw them', async () => {
    const pending = makeRequest({ id: 40, incident: { ...makeRequest().incident, id: 2 } })
    const { fetchMock } = open({
      pending: [pending],
      extra: { 'POST /assignment-requests/40/withdraw': jsonResponse(200, { request: { ...pending, status: 'withdrawn' } }) },
    })
    const user = userEvent.setup()
    const table = await screen.findByRole('table', { name: 'Incidents' })
    const row = within(table).getByRole('link', { name: 'Projector won’t turn on' }).closest('tr')

    expect(await within(row).findByText('Requested')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Withdraw' }))
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/assignment-requests/40/withdraw'))).toBe(true)
  })

  it('is for engineers only', async () => {
    mockApi({ 'GET /auth/me': jsonResponse(200, { user: makeUser() }) })
    renderApp('/incidents/available', { tokens: TOKENS })
    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })
})
