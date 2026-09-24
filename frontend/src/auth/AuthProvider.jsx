import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, onSessionExpired, tokenStore } from '../services/api'
import { AuthContext } from './AuthContext'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Only wait for /auth/me when there is a saved session to check.
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'signed-out'))
  // True after the user chose "Sign out" (rather than the session ending on its own), so the
  // sign-in page doesn't send the next person back to the page the last one was on.
  const [signedOutByUser, setSignedOutByUser] = useState(false)

  const endSession = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    setStatus('signed-out')
  }, [])

  const signOut = useCallback(() => {
    setSignedOutByUser(true)
    endSession()
  }, [endSession])

  // Restore a saved session on page load. Only an invalid session (401) signs the user out;
  // if the server can't be reached or is waking up, keep the session and offer a retry.
  useEffect(() => {
    if (status !== 'loading') return undefined
    let cancelled = false
    api.get('/auth/me')
      .then((data) => {
        if (cancelled) return
        setUser(data.user)
        setStatus('signed-in')
      })
      .catch((error) => {
        if (cancelled) return
        if (error.status === 401) endSession()
        else setStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [status, endSession])

  const retry = useCallback(() => setStatus('loading'), [])

  // Any request that finds the session gone signs the user out.
  useEffect(() => onSessionExpired(() => {
    setSignedOutByUser(false)
    endSession()
  }), [endSession])

  const startSession = useCallback((data) => {
    tokenStore.set(data.tokens)
    setSignedOutByUser(false)
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

  // Changing the password ends other sessions, so the server sends fresh tokens.
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    startSession(await api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }))
  }, [startSession])

  // Save changes to your own account (name, engineer availability and phone).
  const updateProfile = useCallback(async (changes) => {
    const data = await api.patch(`/users/${user.id}`, changes)
    setUser(data.user)
    return data.user
  }, [user])

  const value = useMemo(
    () => ({ user, status, signedOutByUser, signIn, register, signOut, changePassword, updateProfile, retry }),
    [user, status, signedOutByUser, signIn, register, signOut, changePassword, updateProfile, retry],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
