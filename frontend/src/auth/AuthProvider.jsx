import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, onSessionExpired, tokenStore } from '../services/api'
import { AuthContext } from './AuthContext'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Only wait for /auth/me when there is a saved session to check.
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'signed-out'))

  const signOut = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    setStatus('signed-out')
  }, [])

  // Restore a saved session on page load.
  useEffect(() => {
    if (status !== 'loading') return undefined
    let cancelled = false
    api.get('/auth/me')
      .then((data) => {
        if (cancelled) return
        setUser(data.user)
        setStatus('signed-in')
      })
      .catch(() => {
        if (!cancelled) signOut()
      })
    return () => {
      cancelled = true
    }
  }, [status, signOut])

  // Any request that finds the session gone signs the user out.
  useEffect(() => onSessionExpired(signOut), [signOut])

  const startSession = useCallback((data) => {
    tokenStore.set(data.tokens)
    setUser(data.user)
    setStatus('signed-in')
    return data.user
  }, [])

  const signIn = useCallback(async (email, password) => {
    startSession(await api.post('/auth/login', { email, password }, { auth: false }))
  }, [startSession])

  // New accounts are always employees and are signed in straight away.
  const register = useCallback(async ({ email, fullName, password }) => {
    startSession(await api.post('/auth/register', { email, full_name: fullName, password }, { auth: false }))
  }, [startSession])

  const value = useMemo(
    () => ({ user, status, signIn, register, signOut }),
    [user, status, signIn, register, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
