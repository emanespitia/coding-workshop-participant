import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENGINEER_USER, makeRequest } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const ADMIN = { id: 1, full_name: 'Alex Admin', email: 'admin@acme.inc', role: 'admin' }

describe('My requests', () => {
  it('splits waiting requests from decided ones and shows the admin note', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ENGINEER_USER) }),
      'GET /assignment-requests': jsonResponse(200, {
        items: [
          makeRequest({ id: 41 }),
          makeRequest({
            id: 42, status: 'rejected', decision_note: 'Diego covers plumbing', decided_by: ADMIN,
            decided_at: '2026-09-22T10:00:00Z', incident: { ...makeRequest().incident, id: 20, title: 'Water cooler leaking' },
          }),
        ],
      }),
    })
    renderApp('/requests', { tokens: TOKENS })

    const waiting = (await screen.findByRole('heading', { name: 'Waiting for a decision' })).closest('section')
    expect(within(waiting).getByText('Waiting for an admin')).toBeInTheDocument()
    expect(within(waiting).getByText(/I know this model/)).toBeInTheDocument()

    const decided = screen.getByRole('heading', { name: 'Decided' }).closest('section')
    expect(within(decided).getByRole('link', { name: '#20 Water cooler leaking' })).toHaveAttribute('href', '/incidents/20')
    expect(within(decided).getByText('Turned down')).toBeInTheDocument()
    expect(within(decided).getByText(/Diego covers plumbing/)).toBeInTheDocument()
    expect(within(decided).getByText(/turned down by Alex Admin/)).toBeInTheDocument()
  })

  it('withdraws a waiting request', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ENGINEER_USER) }),
      'GET /assignment-requests': jsonResponse(200, { items: [makeRequest({ id: 41 })] }),
      'POST /assignment-requests/41/withdraw': jsonResponse(200, { request: makeRequest({ id: 41, status: 'withdrawn' }) }),
    })
    const user = userEvent.setup()
    renderApp('/requests', { tokens: TOKENS })

    await user.click(await screen.findByRole('button', { name: 'Withdraw request' }))
    expect(fetchMock.mock.calls.some(([url, i]) => i.method === 'POST' && url.endsWith('/41/withdraw'))).toBe(true)
  })

  it('points to available incidents when there are no requests', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ENGINEER_USER) }),
      'GET /assignment-requests': jsonResponse(200, { items: [] }),
    })
    renderApp('/requests', { tokens: TOKENS })
    expect(await screen.findByRole('link', { name: 'See available incidents' })).toHaveAttribute('href', '/incidents/available')
  })
})
