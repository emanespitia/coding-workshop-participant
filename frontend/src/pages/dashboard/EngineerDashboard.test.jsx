import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENGINEER_USER, listOf, makeIncident, makeRequest, makeSummary, PEOPLE } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const engineer = makeUser(ENGINEER_USER)
const summary = makeSummary({
  scope: 'assigned',
  totals: { ...makeSummary().totals, active: 2, resolved_in_window: 3, available_pool: 4 },
  by_status: [{ key: 'open', count: 0 }, { key: 'in_progress', count: 1 }, { key: 'blocked', count: 1 }],
  response_times: {
    ...makeSummary().response_times,
    resolve: { count: 3, avg_hours: 7.5, median_hours: 5.2 },
  },
  communication: null,
})

function open(extra = {}) {
  const incidentQueries = []
  const fetchMock = mockApi({
    'GET /auth/me': jsonResponse(200, { user: engineer }),
    'GET /reports/summary': jsonResponse(200, summary),
    'GET /incidents': (req) => {
      incidentQueries.push(req.query)
      return req.query.get('scope') === 'assigned'
        ? jsonResponse(200, listOf([makeIncident({ id: 3, title: 'Wi-Fi drops', status: 'in_progress', assignee: PEOPLE.engineer })]))
        : jsonResponse(200, listOf([makeIncident({ id: 2, title: 'Monitor flickers', category: 'it_hardware' })]))
    },
    'GET /assignment-requests': jsonResponse(200, { items: [makeRequest({ id: 50, incident: { ...makeRequest().incident, id: 99 } })] }),
    ...extra,
  })
  renderApp('/', { tokens: TOKENS })
  return { fetchMock, incidentQueries }
}

describe('Engineer dashboard', () => {
  it('shows my numbers', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'Hi, Priya' })).toBeInTheDocument()
    const tile = (label) => screen.getByRole('group', { name: label })
    expect(await screen.findByRole('group', { name: 'Assigned to you' })).toBeInTheDocument()
    expect(tile('Assigned to you')).toHaveTextContent('2')
    expect(tile('Blocked')).toHaveTextContent('1')
    expect(tile('Waiting to be taken')).toHaveTextContent('4')
  })

  it('lists my active work by urgency and pickups in my specialties', async () => {
    const { incidentQueries } = open()
    const work = (await screen.findByRole('heading', { name: 'Your work' })).closest('section')
    expect(await within(work).findByRole('link', { name: 'Wi-Fi drops' })).toBeInTheDocument()

    const picks = screen.getByRole('heading', { name: 'Matches your specialties' }).closest('section')
    expect(await within(picks).findByRole('link', { name: 'Monitor flickers' })).toBeInTheDocument()
    expect(within(picks).getByRole('button', { name: 'Request to take' })).toBeInTheDocument()

    const byScope = Object.fromEntries(incidentQueries.map((q) => [q.get('scope'), Object.fromEntries(q)]))
    expect(byScope.assigned).toMatchObject({ status: 'open,in_progress,blocked', sort: '-priority' })
    expect(byScope.available).toMatchObject({ category: 'network,it_hardware', sort: '-priority' })
  })

  it('shows pending requests and my pace', async () => {
    open()
    expect(await screen.findByText('1 waiting for an admin to decide.')).toBeInTheDocument()
    const pace = screen.getByRole('heading', { name: 'Your pace' }).closest('section')
    expect(pace).toHaveTextContent('you resolved 3, usually within 5 hours')
  })

  it('changes availability from the dashboard', async () => {
    const busy = { ...engineer, engineer_profile: { ...engineer.engineer_profile, availability: 'busy' } }
    const { fetchMock } = open({ 'PATCH /users/3': jsonResponse(200, { user: busy }) })
    const user = userEvent.setup()

    const picker = await screen.findByRole('group', { name: 'Your availability' })
    expect(within(picker).getByRole('button', { name: 'Available' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(picker).getByRole('button', { name: 'Busy' }))

    expect(await within(picker).findByRole('button', { name: 'Busy', pressed: true })).toBeInTheDocument()
    const patch = fetchMock.mock.calls.find(([, i]) => i.method === 'PATCH')
    expect(JSON.parse(patch[1].body)).toEqual({ engineer_profile: { availability: 'busy' } })
  })
})
