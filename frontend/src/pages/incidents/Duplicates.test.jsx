import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ADMIN_USER, listOf, makeEvent, makeIncident, makeSummary } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const BUILDINGS = listOf([{ id: 1, name: 'HQ Tower' }])
const SIMILAR = {
  id: 7, title: 'AC not cooling on Floor 2', category: 'hvac', status: 'in_progress',
  building: { id: 1, name: 'HQ Tower' }, floor: { id: 5, name: 'Floor 2', level: 2 }, seat: null,
  created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
}

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

async function fillReport(user) {
  await screen.findByRole('heading', { name: 'Report an incident' })
  await user.type(screen.getByLabelText(/What's wrong\?/), 'Too warm near the windows')
  await user.type(screen.getByLabelText(/Details/), 'It is 29C.')
  await choose(user, 'Kind of problem', 'Heating & cooling')
  await choose(user, 'Building', 'HQ Tower')
  await user.click(screen.getByRole('button', { name: 'Report incident' }))
}

function openReport({ similar = [SIMILAR] } = {}) {
  const calls = { similar: [], posted: 0 }
  const created = makeIncident({ id: 30, title: 'Too warm near the windows' })
  mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser() }),
    'GET /buildings': jsonResponse(200, BUILDINGS),
    'GET /buildings/1/floors': jsonResponse(200, listOf([])),
    'GET /incidents/similar': (req) => {
      calls.similar.push(req.query)
      return jsonResponse(200, { items: similar })
    },
    'POST /incidents': () => {
      calls.posted += 1
      return jsonResponse(201, { incident: created })
    },
    'GET /incidents/30': jsonResponse(200, { incident: created }),
    'GET /incidents/30/notes': jsonResponse(200, { items: [] }),
    'GET /incidents/30/events': jsonResponse(200, { items: [makeEvent()] }),
    'GET /reports/summary': jsonResponse(200, makeSummary()),
    'GET /incidents': jsonResponse(200, listOf([])),
  })
  renderApp('/incidents/new', { tokens: TOKENS })
  return calls
}

describe('Duplicate warning when reporting', () => {
  it('checks for similar incidents at that location and shows only safe details', async () => {
    const calls = openReport()
    const user = userEvent.setup()
    await fillReport(user)

    const dialog = await screen.findByRole('dialog', { name: 'This may already be reported' })
    const list = within(dialog).getByRole('list', { name: 'Similar incidents' })
    expect(within(list).getByText('AC not cooling on Floor 2')).toBeInTheDocument()
    expect(list).toHaveTextContent('HQ Tower · Floor 2 · Heating & cooling · reported 3 hours ago')
    expect(within(list).getByText('In progress')).toBeInTheDocument()
    expect(Object.fromEntries(calls.similar[0])).toEqual({
      building_id: '1', category: 'hvac', title: 'Too warm near the windows',
    })
    expect(calls.posted).toBe(0)
  })

  it("doesn't create anything when it's one of them", async () => {
    const calls = openReport()
    const user = userEvent.setup()
    await fillReport(user)
    await user.click(await screen.findByRole('button', { name: "It's one of these" }))

    expect(await screen.findByText(/already reported, so nothing new was created/)).toBeInTheDocument()
    expect(calls.posted).toBe(0)
  })

  it('reports it anyway when it is different', async () => {
    const calls = openReport()
    const user = userEvent.setup()
    await fillReport(user)
    await user.click(await screen.findByRole('button', { name: 'Mine is different, report it' }))

    expect(await screen.findByRole('heading', { name: 'Too warm near the windows' })).toBeInTheDocument()
    expect(calls.posted).toBe(1)
  })

  it('goes back to the form to edit', async () => {
    const calls = openReport()
    const user = userEvent.setup()
    await fillReport(user)
    await user.click(await screen.findByRole('button', { name: 'Back to editing' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Report incident' })).toBeEnabled()
    expect(screen.getByLabelText(/What's wrong\?/)).toHaveValue('Too warm near the windows')
    expect(calls.posted).toBe(0)
  })

  it('reports straight away when nothing similar is open', async () => {
    const calls = openReport({ similar: [] })
    const user = userEvent.setup()
    await fillReport(user)
    expect(await screen.findByRole('heading', { name: 'Too warm near the windows' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.posted).toBe(1)
  })
})

describe('Possible duplicates for admins', () => {
  const ADMIN_ACTIONS = ['edit', 'change_priority', 'assign', 'escalate', 'add_note', 'close_as_duplicate', 'delete']
  const flagged = makeIncident({
    id: 30, title: 'Too warm near the windows', possible_duplicate_of_id: 7,
    possible_duplicate_of: { id: 7, title: 'AC not cooling on Floor 2', status: 'in_progress' },
    allowed_actions: [...ADMIN_ACTIONS, 'dismiss_possible_duplicate'],
  })

  function openAsAdmin(incident, extra = {}) {
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /incidents/30': jsonResponse(200, { incident }),
      'GET /incidents/30/notes': jsonResponse(200, { items: [] }),
      'GET /incidents/30/events': jsonResponse(200, { items: [makeEvent()] }),
      ...extra,
    })
    renderApp('/incidents/30', { tokens: TOKENS })
    return fetchMock
  }
  const body = (fetchMock, method, path) => {
    const call = fetchMock.mock.calls.find(([url, i]) => i.method === method && url.endsWith(path))
    return call && (call[1].body ? JSON.parse(call[1].body) : {})
  }

  it('shows which incident it may duplicate, with a one-click close', async () => {
    const fetchMock = openAsAdmin(flagged, {
      'POST /incidents/30/close-as-duplicate': jsonResponse(200, { incident: flagged }),
    })
    const user = userEvent.setup()

    const banner = (await screen.findByText(/Possibly the same problem as/)).closest('[role="alert"]')
    expect(within(banner).getByRole('link', { name: '#7 AC not cooling on Floor 2' })).toHaveAttribute('href', '/incidents/7')
    await user.click(within(banner).getByRole('button', { name: 'Close as duplicate' }))
    await screen.findByText(/Possibly the same problem as/)
    expect(body(fetchMock, 'POST', '/close-as-duplicate')).toEqual({ duplicate_of_id: 7 })
  })

  it('clears the flag when it is a different problem', async () => {
    const fetchMock = openAsAdmin(flagged, {
      'DELETE /incidents/30/possible-duplicate': jsonResponse(200, { incident: flagged }),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Not a duplicate' }))
    await screen.findByText(/Possibly the same problem as/)
    expect(body(fetchMock, 'DELETE', '/possible-duplicate')).toEqual({})
  })

  it('closes any incident as a duplicate of a number the admin types', async () => {
    const plain = makeIncident({ id: 30, allowed_actions: ADMIN_ACTIONS })
    const fetchMock = openAsAdmin(plain, {
      'POST /incidents/30/close-as-duplicate': jsonResponse(200, { incident: plain }),
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Close as duplicate…' }))
    const dialog = screen.getByRole('dialog', { name: 'Close as a duplicate' })
    await user.type(within(dialog).getByLabelText(/Incident number it duplicates/), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Close as duplicate' }))
    await screen.findByRole('button', { name: 'Close as duplicate…' })
    expect(body(fetchMock, 'POST', '/close-as-duplicate')).toEqual({ duplicate_of_id: 12 })
  })

  it('marks possible duplicates in the list and filters to them', async () => {
    const queries = []
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /buildings': jsonResponse(200, BUILDINGS),
      'GET /incidents': (req) => {
        queries.push(req.query)
        return jsonResponse(200, listOf([flagged, makeIncident({ id: 7, title: 'AC not cooling on Floor 2' })]))
      },
    })
    const user = userEvent.setup()
    renderApp('/incidents', { tokens: TOKENS })

    const table = await screen.findByRole('table', { name: 'Incidents' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Possible duplicate')
    expect(rows[1]).not.toHaveTextContent('Possible duplicate')

    await user.click(screen.getByRole('button', { name: 'Possible duplicates' }))
    expect(queries.at(-1).get('possible_duplicate')).toBe('true')
  })
})

describe('Closed as a duplicate, seen by the reporter', () => {
  it('explains where the problem is being handled, without a link they cannot open', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser() }),
      'GET /incidents/30': jsonResponse(200, {
        incident: makeIncident({
          id: 30, status: 'closed', closed_at: '2026-09-22T10:00:00Z', allowed_transitions: [], allowed_actions: [],
          close_reason: 'Duplicate of #7: AC not cooling on Floor 2',
          duplicate_of: { id: 7, title: 'AC not cooling on Floor 2', status: 'in_progress' },
        }),
      }),
      'GET /incidents/30/notes': jsonResponse(200, { items: [] }),
      'GET /incidents/30/events': jsonResponse(200, { items: [makeEvent()] }),
    })
    renderApp('/incidents/30', { tokens: TOKENS })

    const outcome = (await screen.findByText(/Closed as a duplicate/)).closest('[role="alert"]')
    expect(outcome).toHaveTextContent('#7 AC not cooling on Floor 2')
    expect(outcome).toHaveTextContent('The facilities team is handling the problem there.')
    expect(within(outcome).queryByRole('link')).not.toBeInTheDocument()
  })
})
