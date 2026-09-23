import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ADMIN_USER, makeRequest } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

function open(items, extra = {}) {
  const fetchMock = mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
    'GET /assignment-requests': jsonResponse(200, { items }),
    ...extra,
  })
  renderApp('/requests', { tokens: TOKENS })
  return fetchMock
}

describe('Admin requests', () => {
  it('approves a request with a note', async () => {
    const fetchMock = open([makeRequest()], {
      'POST /assignment-requests/40/approve': jsonResponse(200, { request: makeRequest({ status: 'approved' }) }),
    })
    const user = userEvent.setup()

    const waiting = (await screen.findByRole('heading', { name: /Waiting for you/ })).closest('section')
    expect(within(waiting).getByText(/Priya Shah/)).toBeInTheDocument()
    expect(within(waiting).getByText('“I know this model”')).toBeInTheDocument()

    await user.click(within(waiting).getByRole('button', { name: 'Approve' }))
    const dialog = screen.getByRole('dialog', { name: 'Assign Priya Shah to #2?' })
    await user.type(within(dialog).getByLabelText(/Note for the engineer/), 'Thanks!')
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('Priya Shah is now assigned to #2.')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/approve'))
    expect(JSON.parse(call[1].body)).toEqual({ note: 'Thanks!' })
  })

  it('turns a request down', async () => {
    const fetchMock = open([makeRequest()], {
      'POST /assignment-requests/40/reject': jsonResponse(200, { request: makeRequest({ status: 'rejected' }) }),
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Turn down' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn down' }))
    expect(await screen.findByText("Priya Shah's request was turned down.")).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith('/reject'))[1].body)).toEqual({ note: null })
  })

  it('shows when nothing is waiting, and recent decisions', async () => {
    open([makeRequest({ id: 9, status: 'rejected', decision_note: 'Diego covers it', decided_at: '2026-09-22T10:00:00Z' })])
    expect(await screen.findByText('All caught up')).toBeInTheDocument()
    const decided = screen.getByRole('heading', { name: 'Recently decided' }).closest('section')
    expect(decided).toHaveTextContent('Turned down')
    expect(decided).toHaveTextContent('Diego covers it')
  })
})
