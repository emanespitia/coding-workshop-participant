import { GuestOnly, RequireAuth, RequireRole } from './auth/guards'
import AppLayout from './layout/AppLayout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import NotFoundPage from './pages/NotFoundPage'
import PlaceholderPage from './pages/PlaceholderPage'

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
          { path: '/incidents', element: <PlaceholderPage /> },
          { path: '/incidents/new', element: <PlaceholderPage /> },
          { path: '/account/password', element: <PlaceholderPage title="Change password" description="Choose a new password for your account." /> },
          {
            element: <RequireRole roles={['engineer']} />,
            children: [{ path: '/incidents/available', element: <PlaceholderPage /> }],
          },
          {
            element: <RequireRole roles={['engineer', 'admin']} />,
            children: [{ path: '/requests', element: <PlaceholderPage /> }],
          },
          {
            element: <RequireRole roles={['admin']} />,
            children: [
              { path: '/facilities', element: <PlaceholderPage /> },
              { path: '/users', element: <PlaceholderPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
