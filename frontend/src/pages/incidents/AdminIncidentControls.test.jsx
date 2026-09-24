import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  ADMIN_USER, listOf, makeAdminSummary, makeEvent, makeIncident, makeLoad, makeRequest, PEOPLE,
} from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'
import { rankEngineers } from '../../utils/engineers'

const ADMIN_ACTIONS = ['edit', 'change_priority', 'assign', 'escalate', 'add_note', 'delete']

function open({ incident = makeIncident({ allowed_actions: ADMIN_ACTIONS }), extra = {} } = {}) {
  const fetchMock = mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
    'GET /incidents/12': jsonResponse(200, { incident }),
    'GET /incidents/12/notes': jsonResponse(200, { items: [] }),
    'GET /incidents/12/events': jsonResponse(200, { items: [makeEvent()] }),
    'GET /reports/summary': jsonResponse(200, makeAdminSummary({
      workload: [
        makeLoad({ id: 2, full_name: 'Sam Rivera', specialties: ['hvac'], active: 0 }),
        makeLoad({ id: 3, full_name: 'Priya Shah', specialties: ['network'], active: 2 }),
        makeLoad({ id: 5, full_name: 'Tom Okafor', specialties: ['furniture'], active: 0 }),
      ],
    })),
    'GET /assignment-requests': jsonResponse(200, { items: [makeRequest({ engineer: { ...PEOPLE.engineer, id: 5, full_name: 'Tom Okafor' } })] }),
    ...extra,
  })
  renderApp('/incidents/12', { tokens: TOKENS })
  return fetchMock
}

const sentTo = (fetchMock, method, path) => fetchMock.mock.calls.find(([url, i]) => i.method === method && url.endsWith(path))

describe('Admin controls on an incident', () => {
  it('assigns an engineer, best matches first', async () => {
    const fetchMock = open({ extra: { 'POST /incidents/12/assign': jsonResponse(200, { incident: makeIncident() }) } })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Assign engineer' }))
    const dialog = screen.getByRole('dialog', { name: 'Assign an engineer' })
    const options = await within(dialog).findAllByRole('radio')
    const names = options.map((o) => o.closest('label').textContent)
    expect(names[0]).toMatch(/Tom Okafor.*Asked to take it/) // asked for it
    expect(names[1]).toMatch(/Priya Shah/) // network specialist
    expect(names[2]).toMatch(/Sam Rivera/)

    await user.click(within(dialog).getByRole('radio', { name: /Priya Shah/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }))
    await screen.findByRole('button', { name: 'Assign engineer' })
    expect(JSON.parse(sentTo(fetchMock, 'POST', '/incidents/12/assign')[1].body)).toEqual({ engineer_id: 3 })
  })

  it('unassigns the current engineer', async () => {
    const fetchMock = open({
      incident: makeIncident({ status: 'in_progress', assignee: PEOPLE.engineer, allowed_actions: ADMIN_ACTIONS }),
      extra: { 'POST /incidents/12/assign': jsonResponse(200, { incident: makeIncident() }) },
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Change engineer' }))
    const dialog = screen.getByRole('dialog', { name: 'Change the engineer' })
    await within(dialog).findAllByRole('radio')
    await user.click(within(dialog).getByRole('button', { name: 'Unassign' }))
    await screen.findByRole('button', { name: 'Change engineer' })
    expect(JSON.parse(sentTo(fetchMock, 'POST', '/incidents/12/assign')[1].body)).toEqual({ engineer_id: null })
  })

  it('changes the priority', async () => {
    const fetchMock = open({ extra: { 'PATCH /incidents/12': jsonResponse(200, { incident: makeIncident() }) } })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('combobox', { name: 'Priority' }))
    await user.click(await screen.findByRole('option', { name: 'Critical' }))
    await screen.findByRole('combobox', { name: 'Priority' })
    expect(JSON.parse(sentTo(fetchMock, 'PATCH', '/incidents/12')[1].body)).toEqual({ priority: 'critical' })
  })

  it('removes an escalation', async () => {
    const fetchMock = open({
      incident: makeIncident({ is_escalated: true, escalation_reason: 'Urgent', allowed_actions: [...ADMIN_ACTIONS, 'deescalate'] }),
      extra: { 'DELETE /incidents/12/escalation': jsonResponse(200, { incident: makeIncident() }) },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove escalation' }))
    await screen.findByRole('button', { name: 'Remove escalation' })
    expect(sentTo(fetchMock, 'DELETE', '/incidents/12/escalation')).toBeTruthy()
  })

  it('deletes after confirming, then shows the list with a message', async () => {
    open({
      extra: {
        'DELETE /incidents/12': new Response(null, { status: 204 }),
        'GET /incidents': jsonResponse(200, listOf([])),
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete incident' }))
    expect(await screen.findByText('Incident #12 was deleted.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Incidents' })).toBeInTheDocument()
  })
})

describe('rankEngineers', () => {
  it('orders by asked, specialty, availability, then load', () => {
    const incident = { category: 'network' }
    const list = [
      makeLoad({ id: 1, full_name: 'Busy match', specialties: ['network'], availability: 'busy', active: 0 }),
      makeLoad({ id: 2, full_name: 'Free match', specialties: ['network'], availability: 'available', active: 3 }),
      makeLoad({ id: 3, full_name: 'Free match, less work', specialties: ['network'], availability: 'available', active: 1 }),
      makeLoad({ id: 4, full_name: 'No match', specialties: ['hvac'], availability: 'available', active: 0 }),
      makeLoad({ id: 5, full_name: 'Asked', specialties: ['hvac'], availability: 'off_duty', active: 5 }),
    ]
    expect(rankEngineers(list, incident, new Set([5])).map((e) => e.id)).toEqual([5, 3, 2, 1, 4])
  })
})

describe('Admin incident list', () => {
  it('has quick filters for escalated and unassigned incidents', async () => {
    const queries = []
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /incidents': (req) => {
        queries.push(req.query)
        return jsonResponse(200, listOf([makeIncident()]))
      },
    })
    const user = userEvent.setup()
    renderApp('/incidents', { tokens: TOKENS })

    await user.click(await screen.findByRole('button', { name: 'Unassigned' }))
    expect(queries.at(-1).get('unassigned')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Escalated' }))
    expect(queries.at(-1).get('escalated')).toBe('true')
    expect(screen.getByRole('button', { name: 'Escalated' })).toHaveAttribute('aria-pressed', 'true')
  })
})
