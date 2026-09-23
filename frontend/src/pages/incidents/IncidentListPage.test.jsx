import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { makeIncident } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, setScreenWidth, TOKENS } from '../../test/utils'

const INCIDENTS = [
  makeIncident({ id: 12, title: 'Wi-Fi drops every few minutes', status: 'in_progress', priority: 'critical' }),
  makeIncident({ id: 4, title: 'Desk lamp flickering', status: 'open', priority: 'low', is_escalated: true }),
]

function mocks({ role = 'employee', items = INCIDENTS, total } = {}) {
  const requests = []
  mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser({ role }) }),
    'GET /incidents': (req) => {
      requests.push(req.query)
      return jsonResponse(200, { items, total: total ?? items.length, page: 1, page_size: 10 })
    },
  })
  return requests
}

describe('My incidents', () => {
  it('lists incidents with their status and priority', async () => {
    mocks()
    renderApp('/incidents', { tokens: TOKENS })

    const table = await screen.findByRole('table', { name: 'Incidents' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'Wi-Fi drops every few minutes' })).toHaveAttribute('href', '/incidents/12')
    expect(within(rows[0]).getByText('In progress')).toBeInTheDocument()
    expect(within(rows[0]).getByLabelText('Critical priority')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/Escalated/)).toBeInTheDocument()
    expect(screen.getByText('2 incidents')).toBeInTheDocument()
  })

  it('shows cards instead of a table on phones', async () => {
    setScreenWidth(390)
    mocks()
    renderApp('/incidents', { tokens: TOKENS })

    const list = await screen.findByRole('list', { name: 'Incidents' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('searches, filters and sorts through the API', async () => {
    const requests = mocks()
    const user = userEvent.setup()
    renderApp('/incidents', { tokens: TOKENS })
    await screen.findByRole('table', { name: 'Incidents' })
    expect(requests[0].get('sort')).toBe('-updated_at')

    await user.type(screen.getByLabelText('Search'), 'wifi{Enter}')
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Active (not resolved)' }))
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    await user.click(await screen.findByRole('option', { name: 'Most urgent first' }))

    const last = requests.at(-1)
    expect(last.get('q')).toBe('wifi')
    expect(last.get('status')).toBe('open,in_progress,blocked')
    expect(last.get('sort')).toBe('-priority')
    expect(last.get('page')).toBe('1')
  })

  it('pages through long lists', async () => {
    const requests = mocks({ total: 23 })
    const user = userEvent.setup()
    renderApp('/incidents', { tokens: TOKENS })
    await screen.findByRole('table', { name: 'Incidents' })

    await user.click(screen.getByRole('button', { name: 'Go to page 3' }))
    expect(requests.at(-1).get('page')).toBe('3')
  })

  it('invites a first report when there is nothing yet', async () => {
    mocks({ items: [] })
    renderApp('/incidents', { tokens: TOKENS })
    expect(await screen.findByText("You haven't reported anything yet")).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Report an incident' }).length).toBeGreaterThan(0)
  })

  it('offers to clear filters when nothing matches', async () => {
    mocks({ items: [] })
    renderApp('/incidents?status=blocked', { tokens: TOKENS })
    expect(await screen.findByText('No incidents match')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it("limits engineers' list to their assigned work", async () => {
    const requests = mocks({ role: 'engineer' })
    renderApp('/incidents', { tokens: TOKENS })
    expect(await screen.findByRole('heading', { name: 'My work' })).toBeInTheDocument()
    expect(requests[0].get('scope')).toBe('assigned')
  })
})
