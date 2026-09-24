import { GuestOnly, RequireAuth, RequireRole } from './auth/guards'
import AppLayout from './layout/AppLayout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import NotFoundPage from './pages/NotFoundPage'
import ChangePasswordPage from './pages/account/ChangePasswordPage'
import ProfilePage from './pages/account/ProfilePage'
import AvailableIncidentsPage from './pages/incidents/AvailableIncidentsPage'
import RequestsPage from './pages/requests/RequestsPage'
import EditIncidentPage from './pages/incidents/EditIncidentPage'
import IncidentDetailPage from './pages/incidents/IncidentDetailPage'
import IncidentListPage from './pages/incidents/IncidentListPage'
import ReportIncidentPage from './pages/incidents/ReportIncidentPage'

/** A route whose page is downloaded only when first opened (admin-only pages). */
function onDemand(path, load) {
  return { path, lazy: async () => ({ Component: (await load()).default }) }
}

/** Every page in the app. Used by the browser router and by tests (memory router). */
export const routes = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/incidents', element: <IncidentListPage key="all" /> },
          { path: '/incidents/new', element: <ReportIncidentPage /> },
          { path: '/incidents/:id', element: <IncidentDetailPage /> },
          { path: '/incidents/:id/edit', element: <EditIncidentPage /> },
          { path: '/account/password', element: <ChangePasswordPage /> },
          { path: '/account/profile', element: <ProfilePage /> },
          {
            element: <RequireRole roles={['engineer']} />,
            children: [{ path: '/incidents/available', element: <AvailableIncidentsPage /> }],
          },
          {
            // Employees' own list is /incidents; engineers and admins get a separate one.
            element: <RequireRole roles={['engineer', 'admin']} />,
            children: [{ path: '/incidents/mine', element: <IncidentListPage mine key="mine" /> }],
          },
          {
            element: <RequireRole roles={['engineer', 'admin']} />,
            children: [{ path: '/requests', element: <RequestsPage /> }],
          },
          {
            element: <RequireRole roles={['admin']} />,
            children: [
              onDemand('/facilities', () => import('./pages/facilities/FacilitiesPage')),
              onDemand('/facilities/:id', () => import('./pages/facilities/BuildingPage')),
              onDemand('/users', () => import('./pages/users/UsersPage')),
              onDemand('/users/:id', () => import('./pages/users/UserPage')),
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
