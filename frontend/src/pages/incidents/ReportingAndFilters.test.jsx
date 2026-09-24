import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  ADMIN_USER, ENGINEER_USER, listOf, makeAdminSummary, makeEvent, makeIncident, makeSummary,
} from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const BUILDINGS = listOf([{ id: 1, name: 'HQ Tower' }, { id: 2, name: 'Riverside Annex' }])

function openList(person, path = '/incidents') {
  const queries = []
  mockApi({
    'GET /auth/me': jsonResponse(200, { user: person }),
    'GET /buildings': jsonResponse(200, BUILDINGS),
    'GET /incidents': (req) => {
      queries.push(req.query)
      return jsonResponse(200, listOf([makeIncident()]))
    },
  })
  renderApp(path, { tokens: TOKENS })
  return queries
}

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('Building filter', () => {
  it('lets admins narrow the incident list to one building', async () => {
    const queries = openList(makeUser(ADMIN_USER))
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Incidents' })

    await choose(user, 'Building', 'Riverside Annex')
    expect(queries.at(-1).get('building_id')).toBe('2')
    expect(queries.at(-1).get('page')).toBe('1')
  })

  it('reads the building from the URL', async () => {
    const queries = openList(makeUser(ADMIN_USER), '/incidents?building=1&status=active')
    await screen.findByRole('table', { name: 'Incidents' })
    expect(queries[0].get('building_id')).toBe('1')
    expect(queries[0].get('status')).toBe('open,in_progress,blocked')
    expect(await screen.findByRole('combobox', { name: 'Building' })).toHaveTextContent('HQ Tower')
  })

  it('is only for admins', async () => {
    const queries = openList(makeUser(), '/incidents?building=1')
    await screen.findByRole('table', { name: 'Incidents' })
    expect(screen.queryByRole('combobox', { name: 'Building' })).not.toBeInTheDocument()
    expect(queries[0].has('building_id')).toBe(false)
  })
})

describe('Floor filter and headline count', () => {
  function openCounted(path = '/incidents') {
    const queries = []
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /buildings': jsonResponse(200, BUILDINGS),
      'GET /buildings/2/floors': jsonResponse(200, listOf([{ id: 5, name: 'Ground' }, { id: 6, name: 'Floor 1' }])),
      'GET /buildings/1/floors': jsonResponse(200, listOf([{ id: 9, name: 'Basement' }])),
      // The total depends on the filters, like the real API.
      'GET /incidents': (req) => {
        queries.push(req.query)
        const total = req.query.get('floor_id') ? 3 : req.query.get('building_id') ? 7 : 22
        return jsonResponse(200, { items: [makeIncident()], total, page: 1, page_size: 10 })
      },
    })
    renderApp(path, { tokens: TOKENS })
    return queries
  }

  const count = () => screen.getByRole('heading', { name: 'Incidents' }).parentElement

  it('shows how many incidents match, and updates with building and floor', async () => {
    const queries = openCounted()
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Incidents' })
    expect(count()).toHaveTextContent('22 incidents in total')
    expect(screen.getByRole('combobox', { name: 'Floor' })).toHaveAttribute('aria-disabled', 'true')

    await choose(user, 'Building', 'Riverside Annex')
    expect(await within(count()).findByText(/Riverside Annex/)).toBeInTheDocument()
    expect(count()).toHaveTextContent('7 incidents · Riverside Annex')

    await choose(user, 'Floor', 'Floor 1')
    expect(queries.at(-1).get('floor_id')).toBe('6')
    expect(await within(count()).findByText(/Floor 1/)).toBeInTheDocument()
    expect(count()).toHaveTextContent('3 incidents · Riverside Annex · Floor 1')
  })

  it('clears the floor when the building changes', async () => {
    const queries = openCounted('/incidents?building=2&floor=6')
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Incidents' })
    expect(queries[0].get('floor_id')).toBe('6')

    await choose(user, 'Building', 'HQ Tower')
    expect(queries.at(-1).get('building_id')).toBe('1')
    expect(queries.at(-1).has('floor_id')).toBe(false)
  })

  it('names the other filters in the count', async () => {
    openCounted('/incidents?status=active&escalated=1&q=wifi')
    await screen.findByRole('table', { name: 'Incidents' })
    expect(count()).toHaveTextContent('22 incidents · Active (not resolved) · Escalated · matching “wifi”')
  })

  it('is only shown to admins (others keep the small count)', async () => {
    openList(makeUser(ENGINEER_USER))
    await screen.findByRole('table', { name: 'Incidents' })
    expect(screen.queryByRole('combobox', { name: 'Floor' })).not.toBeInTheDocument()
    expect(screen.getByText('1 incident')).toBeInTheDocument()
  })
})

describe('My reports', () => {
  it.each([
    ['engineer', makeUser(ENGINEER_USER)],
    ['admin', makeUser(ADMIN_USER)],
  ])('gives the %s a page of the incidents they reported', async (_, person) => {
    const queries = openList(person, '/incidents/mine')
    expect(await screen.findByRole('heading', { name: 'My reports' })).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Incidents' })
    expect(queries[0].get('scope')).toBe('reported')
    expect(screen.getByRole('link', { name: 'My reports' })).toHaveAttribute('aria-current', 'page')
    // the admin-only extras belong to the full Incidents list
    expect(screen.queryByRole('combobox', { name: 'Building' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Escalated' })).not.toBeInTheDocument()
  })

  it('keeps search and filters working on My reports', async () => {
    const queries = openList(makeUser(ENGINEER_USER), '/incidents/mine')
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Incidents' })
    await user.type(screen.getByLabelText('Search'), 'door{Enter}')
    await choose(user, 'Status', 'Open')
    expect(Object.fromEntries(queries.at(-1))).toMatchObject({ scope: 'reported', q: 'door', status: 'open' })
  })

  it('invites a first report when there are none', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /incidents': jsonResponse(200, listOf([])),
    })
    renderApp('/incidents/mine', { tokens: TOKENS })
    expect(await screen.findByText("You haven't reported anything yet")).toBeInTheDocument()
  })

  it('is not a page for employees (their list is My incidents)', async () => {
    openList(makeUser(), '/incidents/mine')
    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })

  it('shows the latest reports on the engineer dashboard', async () => {
    const reported = []
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ENGINEER_USER) }),
      'GET /reports/summary': jsonResponse(200, makeSummary({ scope: 'assigned', communication: null })),
      'GET /incidents': (req) => {
        if (req.query.get('scope') === 'reported') {
          reported.push(req.query)
          return jsonResponse(200, listOf([makeIncident({ id: 77, title: 'Leaky tap I found' })]))
        }
        return jsonResponse(200, listOf([]))
      },
      'GET /assignment-requests': jsonResponse(200, { items: [] }),
    })
    renderApp('/', { tokens: TOKENS })

    const panel = (await screen.findByRole('heading', { name: 'Your reports' })).closest('section')
    expect(await within(panel).findByRole('link', { name: 'Leaky tap I found' })).toHaveAttribute('href', '/incidents/77')
    expect(within(panel).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/incidents/mine')
    expect(reported[0].get('page_size')).toBe('3')
  })
})

describe('Anyone can report an incident', () => {
  it.each([
    ['employee', makeUser()],
    ['engineer', makeUser(ENGINEER_USER)],
    ['admin', makeUser(ADMIN_USER)],
  ])('shows the Report button on the %s list', async (_, person) => {
    openList(person)
    const main = await screen.findByRole('main')
    expect(await within(main).findByRole('link', { name: 'Report an incident' })).toHaveAttribute('href', '/incidents/new')
  })

  it('shows the Report button on engineer and admin dashboards', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ENGINEER_USER) }),
      'GET /reports/summary': jsonResponse(200, makeSummary({ scope: 'assigned', communication: null })),
      'GET /incidents': jsonResponse(200, listOf([])),
      'GET /assignment-requests': jsonResponse(200, { items: [] }),
    })
    const { unmount } = renderApp('/', { tokens: TOKENS })
    expect(await screen.findByRole('link', { name: 'Report an incident' })).toHaveAttribute('href', '/incidents/new')
    unmount()

    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /reports/summary': jsonResponse(200, makeAdminSummary()),
      'GET /buildings': jsonResponse(200, BUILDINGS),
      'GET /assignment-requests': jsonResponse(200, { items: [] }),
    })
    renderApp('/', { tokens: TOKENS })
    expect(await screen.findByRole('link', { name: 'Report an incident' })).toHaveAttribute('href', '/incidents/new')
  })

  it.each([
    ['engineer', makeUser(ENGINEER_USER), 'How urgent is it?', false],
    ['admin', makeUser(ADMIN_USER), 'Priority', true],
  ])('lets an %s report one (priority: %s)', async (_, person, priorityLabel, admin) => {
    const created = makeIncident({ id: 50, title: 'Door stuck', reporter: { ...person } })
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: person }),
      'GET /buildings': jsonResponse(200, BUILDINGS),
      'GET /buildings/1/floors': jsonResponse(200, listOf([])),
      'POST /incidents': jsonResponse(201, { incident: created }),
      'GET /incidents/50': jsonResponse(200, { incident: created }),
      'GET /incidents/50/notes': jsonResponse(200, { items: [] }),
      'GET /incidents/50/events': jsonResponse(200, { items: [makeEvent()] }),
      'GET /reports/summary': jsonResponse(200, makeAdminSummary()),
      'GET /assignment-requests': jsonResponse(200, { items: [] }),
    })
    const user = userEvent.setup()
    renderApp('/incidents/new', { tokens: TOKENS })

    await screen.findByRole('heading', { name: 'Report an incident' })
    expect(screen.getByRole('combobox', { name: priorityLabel })).toBeInTheDocument()
    expect(screen.getByText(admin ? /assign an engineer from the incident page/ : /They'll assign an engineer/)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/What's wrong\?/), 'Door stuck')
    await user.type(screen.getByLabelText(/Details/), 'The fire door on Ground sticks.')
    await choose(user, 'Kind of problem', 'Security')
    await choose(user, priorityLabel, 'High')
    await choose(user, 'Building', 'HQ Tower')
    await user.click(screen.getByRole('button', { name: 'Report incident' }))

    expect(await screen.findByRole('heading', { name: 'Door stuck' })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')
    expect(JSON.parse(post[1].body)).toMatchObject({ title: 'Door stuck', priority: 'high', building_id: 1 })
    expect(within(screen.getByRole('region', { name: 'Details' })).getByText(/^You ·/)).toBeInTheDocument()
  })
})
