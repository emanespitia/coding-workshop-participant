import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ADMIN_USER, listOf } from '../../test/fixtures'
import { apiError, jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

const HQ = {
  id: 1, name: 'HQ Tower', address: '100 Main St', floor_count: 2, created_at: '', updated_at: '',
  floors: [
    { id: 5, building_id: 1, name: 'Ground', level: 0, seat_count: 2 },
    { id: 6, building_id: 1, name: 'Floor 1', level: 1, seat_count: 0 },
  ],
}

function openBuilding(extra = {}) {
  const fetchMock = mockApi({
    'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
    'GET /buildings/1': jsonResponse(200, { building: HQ }),
    'GET /floors/5/seats': jsonResponse(200, listOf([{ id: 20, floor_id: 5, code: 'G-01' }, { id: 21, floor_id: 5, code: 'G-02' }])),
    ...extra,
  })
  renderApp('/facilities/1', { tokens: TOKENS })
  return fetchMock
}

const body = (fetchMock, method, path) => JSON.parse(fetchMock.mock.calls.find(([url, i]) => i.method === method && url.endsWith(path))[1].body)

describe('Facilities', () => {
  it('lists buildings and adds one', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /buildings': jsonResponse(200, listOf([{ ...HQ }])),
      'POST /buildings': jsonResponse(201, { building: { ...HQ, id: 9, name: 'North Wing', floors: [] } }),
      'GET /buildings/9': jsonResponse(200, { building: { ...HQ, id: 9, name: 'North Wing', floors: [] } }),
    })
    const user = userEvent.setup()
    renderApp('/facilities', { tokens: TOKENS })

    const list = await screen.findByRole('list', { name: 'Buildings' })
    expect(within(list).getByRole('link', { name: 'HQ Tower' })).toHaveAttribute('href', '/facilities/1')
    expect(within(list).getByText('100 Main St · 2 floors')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add building' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a building' })
    await user.type(within(dialog).getByLabelText(/Name/), 'North Wing')
    await user.click(within(dialog).getByRole('button', { name: 'Add building' }))

    expect(await screen.findByText('North Wing was added. Now add its floors.')).toBeInTheDocument()
    expect(body(fetchMock, 'POST', '/buildings')).toEqual({ name: 'North Wing', address: null })
  })

  it('shows a duplicate building name on the field', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser(ADMIN_USER) }),
      'GET /buildings': jsonResponse(200, listOf([HQ])),
      'POST /buildings': apiError(409, 'DUPLICATE_NAME', 'A building with this name already exists', { name: 'Already in use' }),
    })
    const user = userEvent.setup()
    renderApp('/facilities', { tokens: TOKENS })

    await user.click(await screen.findByRole('button', { name: 'Add building' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Name/), 'hq tower')
    await user.click(within(dialog).getByRole('button', { name: 'Add building' }))
    expect(await within(dialog).findByText('Already in use')).toBeInTheDocument()
  })

  it('adds a floor with its level', async () => {
    const fetchMock = openBuilding({ 'POST /buildings/1/floors': jsonResponse(201, { floor: { id: 7 } }) })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add floor' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a floor' })
    await user.type(within(dialog).getByLabelText(/Name/), 'Floor 2')
    await user.type(within(dialog).getByLabelText(/Level/), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Add floor' }))

    await screen.findByRole('button', { name: 'Add floor' })
    expect(body(fetchMock, 'POST', '/buildings/1/floors')).toEqual({ name: 'Floor 2', level: 2 })
  })

  it('manages the seats on a floor', async () => {
    const fetchMock = openBuilding({
      'POST /floors/5/seats': jsonResponse(201, { seat: { id: 22, code: 'G-03' } }),
      'DELETE /seats/20': apiError(409, 'IN_USE', 'This seat is referenced by incidents and cannot be deleted'),
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Ground/ }))
    const seats = await screen.findByRole('list', { name: 'Seats on Ground' })
    expect(within(seats).getAllByRole('listitem')).toHaveLength(2)

    await user.type(screen.getByLabelText('New seat code'), 'G-03')
    await user.click(screen.getByRole('button', { name: 'Add seat' }))
    await screen.findByRole('list', { name: 'Seats on Ground' })
    expect(body(fetchMock, 'POST', '/floors/5/seats')).toEqual({ code: 'G-03' })

    await user.click(screen.getByRole('button', { name: 'Remove seat G-01' }))
    expect(await screen.findByText("G-01 has incidents reported at it, so it can't be removed.")).toBeInTheDocument()
  })

  it("explains why a building in use can't be deleted", async () => {
    openBuilding({ 'DELETE /buildings/1': apiError(409, 'IN_USE', 'This building is referenced by incidents and cannot be deleted') })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete HQ Tower?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete building' }))
    expect(await within(dialog).findByText("HQ Tower has incidents reported in it, so it can't be deleted.")).toBeInTheDocument()
  })
})
