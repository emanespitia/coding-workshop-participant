import { Navigate, Outlet, useLocation } from 'react-router'

import FullPageSpinner from '../components/FullPageSpinner'
import SessionUnavailable from '../components/SessionUnavailable'
import NotAllowedPage from '../pages/NotAllowedPage'
import { useAuth } from './AuthContext'

export const CHANGE_PASSWORD_PATH = '/account/password'

/**
 * Pages for signed-in users. Anyone else goes to /login and comes back after signing in.
 * Users who must choose a new password (new accounts, admin resets) do that first.
 */
export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner label="Checking your session" />
  if (status === 'unavailable') return <SessionUnavailable />
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: location }} />
  if (user.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  }
  return <Outlet />
}

/**
 * Pages for signed-out visitors (sign in). Once signed in, the user goes back to
 * the page that sent them here, or to the home page.
 */
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner label="Checking your session" />
  if (status === 'unavailable') return <SessionUnavailable />
  if (status === 'signed-in') {
    const from = location.state?.from
    const target = from ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : '/'
    return <Navigate to={target} replace />
  }
  return <Outlet />
}

/** Pages only some roles may open (e.g. admin pages). Others see a "no access" message. */
export function RequireRole({ roles }) {
  const { user } = useAuth()
  if (!roles.includes(user.role)) return <NotAllowedPage />
  return <Outlet />
}
