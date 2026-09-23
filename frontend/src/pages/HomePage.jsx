import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router'

import { useAuth } from '../auth/AuthContext'
import { PageLoading } from '../components/PageStatus'
import EmployeeDashboard from './dashboard/EmployeeDashboard'
import EngineerDashboard from './dashboard/EngineerDashboard'

// Loaded on demand: the admin dashboard brings the chart library, which other roles never need.
const AdminDashboard = lazy(() => import('./dashboard/AdminDashboard'))

/** The dashboard for the signed-in user's role. */
export default function HomePage() {
  const { user } = useAuth()
  const flash = useLocation().state?.flash

  if (user.role === 'employee') return <EmployeeDashboard flash={flash} />
  if (user.role === 'engineer') return <EngineerDashboard flash={flash} />
  return (
    <Suspense fallback={<PageLoading label="Loading the overview" />}>
      <AdminDashboard flash={flash} />
    </Suspense>
  )
}
