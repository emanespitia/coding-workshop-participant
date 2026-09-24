import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'

import AuthProvider from '../auth/AuthProvider'
import { routes } from '../routes'
import { tokenStore } from '../services/api'
import { theme } from '../theme'

export const TOKENS = { access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'Bearer', expires_in: 1800 }

export function makeUser(overrides = {}) {
  return {
    id: 7,
    email: 'maria.garcia@acme.inc',
    full_name: 'Maria Garcia',
    role: 'employee',
    is_active: true,
    must_change_password: false,
    engineer_profile: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

/** Width React Responsive sees (px). */
export function setScreenWidth(width) {
  window.innerWidth = width
}

export function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function apiError(status, code, message, fields) {
  return jsonResponse(status, { error: { code, message, fields } })
}

/**
 * Replace fetch with a fake API. `handlers` maps "METHOD /path" to a Response or to
 * a function (request) => Response. Unknown requests fail the test with a 599.
 */
export function mockApi(handlers) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    const path = String(url).replace(/^\/api\/helpdesk/, '')
    const [pathname, search = ''] = path.split('?')
    // An exact match (with query string) wins over a match on the path alone.
    const handler = handlers[`${method} ${path}`] ?? handlers[`${method} ${pathname}`]
    if (!handler) return apiError(599, 'UNMOCKED', `No mock for ${method} ${path}`)
    const request = {
      method,
      path: pathname,
      query: new URLSearchParams(search),
      headers: init.headers || {},
      body: init.body ? JSON.parse(init.body) : undefined,
    }
    const response = typeof handler === 'function' ? await handler(request) : handler
    return response.clone()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Render the whole app at `path`, optionally with a saved session. */
export function renderApp(path = '/', { tokens } = {}) {
  if (tokens) tokenStore.set(tokens)
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = render(
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>,
  )
  return { ...result, router }
}
