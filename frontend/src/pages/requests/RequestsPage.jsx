import { useAuth } from '../../auth/AuthContext'
import AdminRequestsPage from './AdminRequestsPage'
import MyRequestsPage from './MyRequestsPage'

/** /requests: engineers see their own requests; admins review everyone's. */
export default function RequestsPage() {
  const { user } = useAuth()
  return user.role === 'engineer' ? <MyRequestsPage /> : <AdminRequestsPage />
}
