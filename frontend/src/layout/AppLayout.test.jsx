import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { tokenStore } from '../services/api'
import { jsonResponse, makeUser, mockApi, renderApp, setScreenWidth, TOKENS } from '../test/utils'

const PEOPLE = {
  employee: makeUser(),
  engineer: makeUser({ id: 3, full_name: 'Priya Shah', email: 'priya.shah@acme.inc', role: 'engineer' }),
  admin: makeUser({ id: 1, full_name: 'Morgan Facilities', email: 'morgan.facilities@acme.inc', role: 'admin' }),
}

/** Render the app at `path`, signed in as a user with this role. */
async function signedInAs(role, path = '/') {
  mockApi({ 'GET /auth/me': jsonResponse(200, { user: PEOPLE[role] }) })
  const result = renderApp(path, { tokens: TOKENS })
  await screen.findByRole('button', { name: `Account menu for ${PEOPLE[role].full_name}` })
  return result
}

function navLinkNames() {
  const nav = screen.getByRole('navigation', { name: 'Main' })
  return within(nav).getAllByRole('link').map((link) => link.textContent)
}

describe('Navigation bar', () => {
  it.each([
    ['employee', ['Dashboard', 'My incidents', 'Report an incident']],
    ['engineer', ['Dashboard', 'My work', 'Available', 'My requests']],
    ['admin', ['Dashboard', 'Incidents', 'Requests', 'Facilities', 'Users']],
  ])('shows the %s their own links', async (role, links) => {
    await signedInAs(role)
    expect(navLinkNames()).toEqual(links)
  })

  it('marks the current page and moves between pages', async () => {
    const user = userEvent.setup()
    await signedInAs('admin')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('link', { name: 'Facilities' }))
    expect(await screen.findByRole('heading', { name: 'Facilities' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Facilities' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('names shared pages the way each role knows them', async () => {
    await signedInAs('engineer', '/incidents')
    expect(screen.getByRole('heading', { name: 'My work' })).toBeInTheDocument()
  })

  it('keeps admin pages from other roles', async () => {
    await signedInAs('employee', '/users')
    expect(screen.getByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })

  it('lets admins open admin pages', async () => {
    await signedInAs('admin', '/users')
    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument()
  })
})

describe('On phones', () => {
  it('moves the links into a menu that closes after choosing a page', async () => {
    setScreenWidth(390)
    const user = userEvent.setup()
    await signedInAs('engineer')

    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(navLinkNames()).toEqual(['Dashboard', 'My work', 'Available', 'My requests'])

    await user.click(screen.getByRole('link', { name: 'Available' }))
    expect(await screen.findByRole('heading', { name: 'Available' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument())
  })
})

describe('Account menu', () => {
  it('shows who is signed in and their role', async () => {
    const user = userEvent.setup()
    await signedInAs('admin')

    await user.click(screen.getByRole('button', { name: 'Account menu for Morgan Facilities' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('morgan.facilities@acme.inc')).toBeInTheDocument()
    expect(within(menu).getByText('Facility admin')).toBeInTheDocument()
  })

  it('opens the change-password page', async () => {
    const user = userEvent.setup()
    await signedInAs('employee')

    await user.click(screen.getByRole('button', { name: 'Account menu for Maria Garcia' }))
    await user.click(screen.getByRole('menuitem', { name: 'Change password' }))
    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()
  })

  it('switches the theme', async () => {
    const user = userEvent.setup()
    await signedInAs('employee')

    await user.click(screen.getByRole('button', { name: 'Account menu for Maria Garcia' }))
    await user.click(screen.getByRole('menuitem', { name: 'Dark' }))
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    expect(screen.getByRole('menuitem', { name: 'Dark' })).toHaveClass('Mui-selected')
  })

  it('signs out', async () => {
    const user = userEvent.setup()
    await signedInAs('engineer')

    await user.click(screen.getByRole('button', { name: 'Account menu for Priya Shah' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(tokenStore.get()).toBeNull()
  })
})
