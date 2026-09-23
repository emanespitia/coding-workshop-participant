import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENGINEER_USER, makeEvent, makeIncident, makeNote, makeRequest, PEOPLE } from '../../test/fixtures'
import { apiError, jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

/** Render incident 12 for Maria (the reporter). `incident` can be a function of call count. */
function open({ incident = makeIncident(), notes = [], events = [makeEvent()], extra = {}, user = makeUser() } = {}) {
  const calls = []
  const fetchMock = mockApi({
    'GET /auth/me': jsonResponse(200, { user }),
    'GET /incidents/12': () => {
      calls.push('get')
      const value = typeof incident === 'function' ? incident(calls.length) : incident
      return jsonResponse(200, { incident: value })
    },
    'GET /incidents/12/notes': jsonResponse(200, { items: notes }),
    'GET /incidents/12/events': jsonResponse(200, { items: events }),
    ...extra,
  })
  renderApp('/incidents/12', { tokens: TOKENS })
  return fetchMock
}

const sent = (fetchMock, method, path) => {
  const call = fetchMock.mock.calls.find(([url, init]) => init.method === method && url.endsWith(path))
  return call && JSON.parse(call[1].body ?? 'null')
}

describe('Incident detail', () => {
  it('shows what, where, who and how far along it is', async () => {
    open({
      incident: makeIncident({
        status: 'in_progress', assignee: PEOPLE.engineer, allowed_transitions: [], allowed_actions: ['add_note'],
      }),
      events: [
        makeEvent(),
        makeEvent({ id: 2, type: 'assigned', to_value: 'Priya Shah', actor: { ...PEOPLE.engineer, role: 'admin', full_name: 'Alex Admin', id: 1 } }),
      ],
    })

    expect(await screen.findByRole('heading', { name: 'Wi-Fi drops every few minutes' })).toBeInTheDocument()
    expect(screen.getByText('Riverside Annex · Floor 1')).toBeInTheDocument()
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByText('Network & Wi-Fi')).toBeInTheDocument()
    expect(within(details).getByText('Priya Shah')).toBeInTheDocument()
    expect(within(details).getByText(/^You ·/)).toBeInTheDocument()

    const progress = screen.getByLabelText('Progress')
    expect(within(progress).getByText('In progress')).toBeInTheDocument()

    const history = screen.getByRole('region', { name: 'History' })
    expect(within(history).getByText(/assigned it to Priya Shah/)).toBeInTheDocument()
    expect(within(history).getByText(/reported the incident/)).toBeInTheDocument()
  })

  it('lets the reporter cancel an open incident with a reason', async () => {
    const fetchMock = open({
      incident: (n) => (n === 1 ? makeIncident() : makeIncident({
        status: 'closed', close_reason: 'Fixed itself', closed_at: '2026-09-22T10:00:00Z',
        allowed_transitions: [], allowed_actions: [],
      })),
      extra: { 'POST /incidents/12/status': jsonResponse(200, { incident: makeIncident() }) },
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Cancel incident' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel this incident?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel incident' }))
    expect(within(dialog).getByText('This is required')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Why are you cancelling it/), 'Fixed itself')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel incident' }))

    expect(await screen.findByText(/Closed:/)).toBeInTheDocument()
    expect(sent(fetchMock, 'POST', '/incidents/12/status')).toEqual({ status: 'closed', comment: 'Fixed itself' })
    expect(screen.queryByRole('button', { name: 'Cancel incident' })).not.toBeInTheDocument()
  })

  it('lets the reporter escalate with a reason', async () => {
    const fetchMock = open({ extra: { 'POST /incidents/12/escalate': jsonResponse(200, { incident: makeIncident() }) } })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Escalate' }))
    const dialog = screen.getByRole('dialog', { name: 'Escalate this incident?' })
    await user.type(within(dialog).getByLabelText(/Why does it need attention/), 'Meetings keep dropping')
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }))

    await screen.findByRole('button', { name: 'Escalate' })
    expect(sent(fetchMock, 'POST', '/incidents/12/escalate')).toEqual({ reason: 'Meetings keep dropping' })
  })

  it('shows an error from the server inside the dialog', async () => {
    open({
      extra: {
        'POST /incidents/12/escalate': apiError(409, 'ALREADY_ESCALATED', 'This incident is already escalated'),
      },
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Escalate' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Why does it need attention/), 'Urgent')
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }))
    expect(await within(dialog).findByText('This incident is already escalated')).toBeInTheDocument()
  })

  it('shows notes, marks staff notes and posts new ones', async () => {
    const fetchMock = open({
      notes: [makeNote(), makeNote({ id: 2, author: PEOPLE.reporter, body: 'Still dropping.' })],
      extra: { 'POST /incidents/12/notes': jsonResponse(201, { note: makeNote({ id: 3 }) }) },
    })
    const user = userEvent.setup()

    const notes = await screen.findByRole('region', { name: /Notes/ })
    expect(within(notes).getByText('Access point firmware looks outdated.')).toBeInTheDocument()
    expect(within(notes).getByText('Engineer')).toBeInTheDocument()
    expect(within(notes).getByText('You')).toBeInTheDocument()

    await user.type(within(notes).getByLabelText('Add a note'), 'Thanks for the update')
    await user.click(within(notes).getByRole('button', { name: 'Post note' }))
    await within(notes).findByRole('button', { name: 'Post note' })
    expect(sent(fetchMock, 'POST', '/incidents/12/notes')).toEqual({ body: 'Thanks for the update' })
  })

  it('lets people edit and delete only their own notes', async () => {
    const fetchMock = open({
      notes: [makeNote(), makeNote({ id: 2, author: PEOPLE.reporter, body: 'Still dropping.' })],
      extra: {
        'PATCH /incidents/12/notes/2': jsonResponse(200, { note: makeNote({ id: 2 }) }),
        'DELETE /incidents/12/notes/2': new Response(null, { status: 204 }),
      },
    })
    const user = userEvent.setup()
    const notes = await screen.findByRole('region', { name: /Notes/ })

    expect(within(notes).getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    await user.click(within(notes).getByRole('button', { name: 'Edit' }))
    const editor = within(notes).getByLabelText('Edit note')
    await user.clear(editor)
    await user.type(editor, 'Still dropping every 5 minutes.')
    await user.click(within(notes).getByRole('button', { name: 'Save' }))
    await within(notes).findByRole('button', { name: 'Delete' })
    expect(sent(fetchMock, 'PATCH', '/incidents/12/notes/2')).toEqual({ body: 'Still dropping every 5 minutes.' })

    await user.click(within(notes).getByRole('button', { name: 'Delete' }))
    expect(fetchMock.mock.calls.some(([url, init]) => init.method === 'DELETE' && url.endsWith('/notes/2'))).toBe(true)
  })

  it('offers no actions on a closed incident', async () => {
    open({
      incident: makeIncident({
        status: 'closed', resolution: 'Firmware updated', resolved_at: '2026-09-21T12:00:00Z',
        closed_at: '2026-09-22T12:00:00Z', allowed_transitions: [], allowed_actions: [],
      }),
    })

    expect(await screen.findByText(/Resolution:/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel incident|Escalate|Edit details/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add a note')).not.toBeInTheDocument()
    expect(screen.getByText('This incident is closed, so notes are read-only.')).toBeInTheDocument()
  })

  it('shows the workflow buttons an engineer is allowed', async () => {
    const engineer = makeUser({ ...PEOPLE.engineer })
    open({
      user: engineer,
      incident: makeIncident({
        status: 'in_progress', assignee: PEOPLE.engineer,
        allowed_transitions: ['blocked', 'resolved'], allowed_actions: ['add_note'],
      }),
    })

    expect(await screen.findByRole('button', { name: 'Mark blocked' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Escalate' })).not.toBeInTheDocument()
  })

  it('lets an engineer ask to take an open incident', async () => {
    const fetchMock = open({
      user: makeUser(ENGINEER_USER),
      // Like the API: once a request is pending, `request_assignment` is no longer offered.
      incident: (n) => makeIncident({
        allowed_transitions: [],
        allowed_actions: n === 1 ? ['request_assignment'] : [],
        my_assignment_request: n === 1 ? null : { id: 40, status: 'pending', created_at: '2026-09-22T10:00:00Z' },
      }),
      extra: { 'POST /incidents/12/assignment-requests': jsonResponse(201, { request: makeRequest() }) },
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Request to take' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Requested')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
    expect(sent(fetchMock, 'POST', '/incidents/12/assignment-requests')).toEqual({ message: null })
  })

  it('tells an engineer when an earlier request was turned down', async () => {
    open({
      user: makeUser(ENGINEER_USER),
      incident: makeIncident({
        allowed_transitions: [], allowed_actions: ['request_assignment'],
        my_assignment_request: { id: 40, status: 'rejected', created_at: '2026-09-22T10:00:00Z' },
      }),
    })
    expect(await screen.findByText(/turned down your earlier request/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request to take' })).toBeInTheDocument()
  })

  it("says so when the incident doesn't exist or isn't visible", async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser() }),
      'GET /incidents/12': apiError(404, 'NOT_FOUND', 'Incident not found'),
      'GET /incidents/12/notes': apiError(404, 'NOT_FOUND', 'Incident not found'),
      'GET /incidents/12/events': apiError(404, 'NOT_FOUND', 'Incident not found'),
    })
    renderApp('/incidents/12', { tokens: TOKENS })
    expect(await screen.findByText(/doesn't exist, or you don't have access/)).toBeInTheDocument()
  })
})
