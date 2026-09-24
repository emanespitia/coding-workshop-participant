/**
 * Small fetch wrapper for the helpdesk API.
 *
 * - Sends the signed-in user's access token.
 * - Turns the API's error envelope ({ error: { code, message, fields } }) into an ApiError.
 * - When the access token has expired, refreshes it once and retries the request.
 * - When the session can't be recovered, clears the tokens and tells the app (onSessionExpired).
 */

const TOKENS_KEY = 'helpdesk.tokens'

/** Where the API lives: /api/helpdesk on the same origin (CloudFront on AWS, the Vite proxy locally). */
export function apiBase() {
  if (import.meta.env.VITE_HELPDESK_API) return import.meta.env.VITE_HELPDESK_API
  try {
    // Set by bin/deploy-frontend.sh from Terraform, e.g. {"helpdesk": "/api/helpdesk"}
    const endpoints = JSON.parse(import.meta.env.VITE_API_ENDPOINTS || '{}')
    if (typeof endpoints.helpdesk === 'string' && endpoints.helpdesk.startsWith('/')) return endpoints.helpdesk
  } catch {
    // not JSON: fall through to the default
  }
  return '/api/helpdesk'
}

export class ApiError extends Error {
  constructor(status, { code = 'ERROR', message = 'Something went wrong. Please try again.', fields = {} } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields || {}
  }
}

/** Access and refresh tokens, kept in localStorage so a reload keeps you signed in. */
export const tokenStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(TOKENS_KEY))
    } catch {
      return null
    }
  },
  set(tokens) {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
    } catch {
      // storage unavailable (private mode): the session lasts until the page is closed
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKENS_KEY)
    } catch {
      // nothing stored
    }
  },
}

let sessionExpiredHandler = null

/** Register a callback for when the session ends (tokens revoked or refresh failed). */
export function onSessionExpired(handler) {
  sessionExpiredHandler = handler
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = null
  }
}

function expireSession() {
  tokenStore.clear()
  sessionExpiredHandler?.()
}

async function send(method, path, body, accessToken) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response
  try {
    response = await fetch(apiBase() + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: "Can't reach the helpdesk right now. Check your connection and try again.",
    })
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data?.error)
  return data
}

// One refresh at a time: requests that expire together wait for the same refresh.
let refreshing = null

function refreshTokens() {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = tokenStore.get()?.refresh_token
      if (!refreshToken) {
        throw new ApiError(401, { code: 'SESSION_EXPIRED', message: 'Your session has ended. Please sign in again.' })
      }
      const data = await send('POST', '/auth/refresh', { refresh_token: refreshToken })
      tokenStore.set(data.tokens)
      return data.tokens
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

/**
 * Call the API. `auth: false` skips the token (sign-in, registration).
 * Resolves with the parsed JSON body; rejects with an ApiError.
 */
export async function request(method, path, { body, auth = true } = {}) {
  const accessToken = auth ? tokenStore.get()?.access_token : undefined
  try {
    return await send(method, path, body, accessToken)
  } catch (error) {
    if (!auth || error.status !== 401) throw error
    if (error.code !== 'TOKEN_EXPIRED') {
      expireSession()
      throw error
    }
    let tokens
    try {
      tokens = await refreshTokens()
    } catch (refreshError) {
      if (refreshError.status === 401) expireSession()
      throw refreshError
    }
    return send(method, path, body, tokens.access_token)
  }
}

export const api = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
}
