import { describe, expect, it, vi } from 'vitest'

import { apiError, jsonResponse, mockApi, TOKENS } from '../test/utils'
import { api, ApiError, onSessionExpired, tokenStore } from './api'

describe('api client', () => {
  it('calls /api/helpdesk with the access token and returns the JSON body', async () => {
    tokenStore.set(TOKENS)
    const fetchMock = mockApi({ 'GET /auth/me': jsonResponse(200, { user: { id: 1 } }) })

    await expect(api.get('/auth/me')).resolves.toEqual({ user: { id: 1 } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/helpdesk/auth/me')
    expect(init.headers.Authorization).toBe('Bearer access-1')
  })

  it('skips the token for public calls and sends JSON bodies', async () => {
    tokenStore.set(TOKENS)
    const fetchMock = mockApi({ 'POST /auth/login': jsonResponse(200, { ok: true }) })

    await api.post('/auth/login', { email: 'a@acme.inc', password: 'x' }, { auth: false })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ email: 'a@acme.inc', password: 'x' })
  })

  it('turns the error envelope into an ApiError', async () => {
    mockApi({ 'POST /auth/login': apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', { email: 'Bad' }) })

    const error = await api.post('/auth/login', {}, { auth: false }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', fields: { email: 'Bad' } })
    expect(error.message).toBe('Check the highlighted fields')
  })

  it('reports a network failure clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await api.get('/auth/me').catch((e) => e)
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('refreshes an expired token once and retries the request', async () => {
    tokenStore.set(TOKENS)
    const fresh = { ...TOKENS, access_token: 'access-2', refresh_token: 'refresh-2' }
    const fetchMock = mockApi({
      'GET /auth/me': (req) => (req.headers.Authorization === 'Bearer access-2'
        ? jsonResponse(200, { user: { id: 1 } })
        : apiError(401, 'TOKEN_EXPIRED', 'Token has expired')),
      'POST /auth/refresh': (req) => {
        expect(req.body).toEqual({ refresh_token: 'refresh-1' })
        return jsonResponse(200, { user: { id: 1 }, tokens: fresh })
      },
    })

    await expect(api.get('/auth/me')).resolves.toEqual({ user: { id: 1 } })
    expect(tokenStore.get().access_token).toBe('access-2')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('shares one refresh between requests that expire together', async () => {
    tokenStore.set(TOKENS)
    const fresh = { ...TOKENS, access_token: 'access-2' }
    const fetchMock = mockApi({
      'GET /auth/me': (req) => (req.headers.Authorization === 'Bearer access-2'
        ? jsonResponse(200, { ok: true })
        : apiError(401, 'TOKEN_EXPIRED', 'Token has expired')),
      'POST /auth/refresh': jsonResponse(200, { tokens: fresh }),
    })

    await Promise.all([api.get('/auth/me'), api.get('/auth/me')])
    const refreshes = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))
    expect(refreshes).toHaveLength(1)
  })

  it('ends the session when the refresh token is no longer valid', async () => {
    tokenStore.set(TOKENS)
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)
    mockApi({
      'GET /auth/me': apiError(401, 'TOKEN_EXPIRED', 'Token has expired'),
      'POST /auth/refresh': apiError(401, 'SESSION_REVOKED', 'Session is no longer valid'),
    })

    await expect(api.get('/auth/me')).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    expect(tokenStore.get()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('ends the session on any other 401 without trying to refresh', async () => {
    tokenStore.set(TOKENS)
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)
    const fetchMock = mockApi({ 'GET /auth/me': apiError(401, 'SESSION_REVOKED', 'Session is no longer valid') })

    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(tokenStore.get()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
