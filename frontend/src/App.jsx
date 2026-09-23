import { CssBaseline } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { createBrowserRouter, RouterProvider } from 'react-router'

import AuthProvider from './auth/AuthProvider'
import { routes } from './routes'
import { theme } from './theme'

const router = createBrowserRouter(routes)

export default function App() {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  )
}
