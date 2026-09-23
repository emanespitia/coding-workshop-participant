import { createContext, useContext } from 'react'

/**
 * The signed-in user and the actions that change it. Provided by <AuthProvider>.
 *
 * status: 'loading' (checking a saved session) | 'signed-in' | 'signed-out'
 */
export const AuthContext = createContext(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
