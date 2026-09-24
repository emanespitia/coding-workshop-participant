import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ADMIN_USER, listOf, makeAdminSummary, makeRequest } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

function open({ pending = [] } = {}) {
  const summaryQueries = []
  mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
    'GET /reports/summary': (req) => {
      summaryQueries.push(req.query)
      return jsonResponse(200, makeAdminSummary())
    },
    'GET /buildings': jsonResponse(200, listOf([{ id: 1, name: 'HQ Tower' }, { id: 2, name: 'Riverside Annex' }])),
    'GET /assignment-requests': jsonResponse(200, { items: pending }),
  })
  renderApp('/', { tokens: TOKENS })
  return summaryQueries
}

const section = (name) => screen.getByRole('heading', { name }).closest('section')

describe('Admin dashboard', () => {
  it('leads with the numbers that need action', async () => {
    open()
    expect(await screen.findByRole('group', { name: 'Active incidents' })).toHaveTextContent('9')
    expect(screen.getByRole('group', { name: 'Waiting for an engineer' })).toHaveTextContent('4')
    expect(screen.getByRole('group', { name: 'Escalated' })).toHaveTextContent('2')
    expect(screen.getByRole('group', { name: 'Resolved' })).toHaveTextContent('10')
  })

  it('shows escalated and blocked incidents once each, with the reason', async () => {
    open()
    const attention = (await screen.findByRole('heading', { name: 'Needs attention' })).closest('section')
    expect(within(attention).getAllByRole('link', { name: 'Badge reader rejects all badges' })).toHaveLength(1)
    expect(within(attention).getByText(/Escalated .*Staff have to walk around · Lee Chen/)).toBeInTheDocument()
  })

  it('shows response times, workload, hotspots and communication', async () => {
    open()
    await screen.findByRole('heading', { name: 'Response times' })
    const times = within(section('Response times')).getByRole('table')
    expect(within(times).getByRole('row', { name: /Resolved/ })).toHaveTextContent('22 h')

    const workload = within(section('Engineer workload')).getByRole('table', { name: 'Engineer workload' })
    const rows = within(workload).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Sam Rivera')
    expect(within(rows[1]).getByText('Off duty')).toBeInTheDocument()

    expect(within(section('Recurring problem spots')).getByText('HQ Tower')).toBeInTheDocument()
    expect(section('Keeping people informed')).toHaveTextContent('9 of 21')
  })

  it('offers the trend and categories as tables too', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('heading', { name: /Reported and resolved per day/ })
    await user.click(screen.getByRole('button', { name: 'Show as table: incidents per day' }))
    const table = screen.getByRole('table', { name: 'Reported and resolved per day' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Show as table: incidents by category' }))
    expect(within(screen.getByRole('table', { name: 'Incidents by category' })).getByText('Heating & cooling')).toBeInTheDocument()
  })

  it('filters by period and building', async () => {
    const user = userEvent.setup()
    const queries = open()
    await screen.findByRole('group', { name: 'Active incidents' })
    expect(queries[0].get('days')).toBe('30')

    await user.click(screen.getByRole('combobox', { name: 'Period' }))
    await user.click(await screen.findByRole('option', { name: 'Last 7 days' }))
    await user.click(screen.getByRole('combobox', { name: 'Building' }))
    await user.click(await screen.findByRole('option', { name: 'Riverside Annex' }))

    expect(queries.at(-1).get('days')).toBe('7')
    expect(queries.at(-1).get('building_id')).toBe('2')
  })

  it('points to requests waiting for a decision', async () => {
    open({ pending: [makeRequest(), makeRequest({ id: 41 })] })
    expect(await screen.findByText('2 engineer requests are waiting for your decision.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/requests')
  })
})
