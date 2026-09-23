import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { listOf, makeIncident, makeSummary } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

function open(summary = makeSummary(), recent = [makeIncident()]) {
  const fetchMock = mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser() }),
    'GET /reports/summary': jsonResponse(200, summary),
    'GET /incidents': jsonResponse(200, listOf(recent)),
  })
  renderApp('/', { tokens: TOKENS })
  return fetchMock
}

describe('Employee dashboard', () => {
  it('shows headline numbers from the report', async () => {
    const fetchMock = open()
    expect(await screen.findByRole('heading', { name: 'Hi, Maria' })).toBeInTheDocument()

    const tile = (label) => screen.getByRole('group', { name: label })
    expect(await screen.findByRole('group', { name: 'Still being worked on' })).toBeInTheDocument()
    expect(tile('Still being worked on')).toHaveTextContent('3')
    expect(tile('Waiting for an engineer')).toHaveTextContent('1')
    expect(tile('Fixed in the last 30 days')).toHaveTextContent('2')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/reports/summary?days=30'))).toBe(true)
  })

  it('lists recently updated incidents and what needs attention (once each)', async () => {
    open()
    const recent = (await screen.findByRole('heading', { name: 'Recently updated' })).closest('section')
    expect(within(recent).getByRole('link', { name: 'Wi-Fi drops every few minutes' })).toHaveAttribute('href', '/incidents/12')

    const attention = screen.getByRole('heading', { name: 'Needs attention' }).closest('section')
    expect(within(attention).getAllByRole('link', { name: 'Badge reader rejects all badges' })).toHaveLength(1)
    expect(within(attention).getByText(/Blocked: Vendor needs to replace the controller board/)).toBeInTheDocument()
  })

  it('says how well the team keeps them informed', async () => {
    open()
    const section = (await screen.findByRole('heading', { name: 'Updates from the team' })).closest('section')
    expect(section).toHaveTextContent('4 of 7')
    expect(section).toHaveTextContent('within 2 hours')
  })

  it('invites a first report when there is nothing yet', async () => {
    open(makeSummary({ totals: { ...makeSummary().totals, total: 0 } }), [])
    expect(await screen.findByText('Nothing reported yet')).toBeInTheDocument()
  })
})
