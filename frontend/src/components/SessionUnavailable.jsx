import { Box, Button, Stack, Typography } from '@mui/material'

import { useAuth } from '../auth/AuthContext'
import BrandMark from './BrandMark'

/**
 * Shown when a saved session couldn't be checked because the helpdesk didn't answer
 * (offline, or the server is starting up). The session is kept; "Try again" rechecks it.
 */
export default function SessionUnavailable() {
  const { retry, signOut } = useAuth()
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2, bgcolor: 'background.default' }}>
      <Stack spacing={2.5} sx={{ maxWidth: 440, alignItems: 'flex-start' }}>
        <Box sx={{ color: 'primary.main' }}><BrandMark /></Box>
        <Typography variant="h2" component="h1">Can't reach the helpdesk</Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          You're still signed in, but the helpdesk didn't answer. It may be starting up, or your connection
          dropped. Try again in a few seconds.
        </Typography>
        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" onClick={retry}>Try again</Button>
          <Button onClick={signOut}>Sign out</Button>
        </Stack>
      </Stack>
    </Box>
  )
}
