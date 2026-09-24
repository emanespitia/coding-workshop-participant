import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { listOf, makeEvent, makeIncident } from '../../test/fixtures'
import { jsonResponse, makeUser, mockApi, renderApp, TOKENS } from '../../test/utils'

describe('Edit an incident', () => {
  it('sends only the fields that changed', async () => {
    const incident = makeIncident()
    const fetchMock = mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser() }),
      'GET /incidents/12': jsonResponse(200, { incident }),
      'PATCH /incidents/12': jsonResponse(200, { incident }),
      'GET /incidents/12/notes': jsonResponse(200, { items: [] }),
      'GET /incidents/12/events': jsonResponse(200, { items: [makeEvent()] }),
      'GET /buildings': jsonResponse(200, listOf([{ id: 2, name: 'Riverside Annex' }])),
      'GET /buildings/2/floors': jsonResponse(200, listOf([{ id: 5, name: 'Floor 1', level: 1 }])),
      'GET /floors/5/seats': jsonResponse(200, listOf([])),
    })
    const user = userEvent.setup()
    renderApp('/incidents/12/edit', { tokens: TOKENS })

    const details = await screen.findByLabelText(/Details/)
    expect(screen.queryByRole('combobox', { name: /priority|urgent/i })).not.toBeInTheDocument()
    await user.clear(details)
    await user.type(details, 'Now the second floor too.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Your changes have been saved.')).toBeInTheDocument()
    const patch = fetchMock.mock.calls.find(([, init]) => init.method === 'PATCH')
    expect(JSON.parse(patch[1].body)).toEqual({ description: 'Now the second floor too.' })
  })

  it('explains when the incident can no longer be edited', async () => {
    mockApi({
      'GET /auth/me': jsonResponse(200, { user: makeUser() }),
      'GET /incidents/12': jsonResponse(200, {
        incident: makeIncident({ status: 'in_progress', allowed_actions: ['add_note'] }),
      }),
    })
    renderApp('/incidents/12/edit', { tokens: TOKENS })
    expect(await screen.findByText(/can't be edited any more/)).toBeInTheDocument()
  })
})
