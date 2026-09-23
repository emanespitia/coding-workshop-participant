import { Paper, Stack, Typography } from '@mui/material'
import { useLocation } from 'react-router'

import { useAuth } from '../auth/AuthContext'
import { navItemsFor } from '../layout/navigation'

/**
 * Stand-in for pages that aren't built yet. Takes its title from the navigation link
 * that points here, so each role sees the name it knows the page by.
 */
export default function PlaceholderPage({ title, description }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const item = navItemsFor(user.role).find((i) => i.to === pathname)

  return (
    <Stack spacing={3}>
      <Typography variant="h2" component="h1">{item?.label ?? title}</Typography>
      <Paper variant="outlined" sx={{ p: 3, borderStyle: 'dashed' }}>
        <Stack spacing={1}>
          <Typography sx={{ fontWeight: 600 }}>Coming soon</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{item?.description ?? description}</Typography>
        </Stack>
      </Paper>
    </Stack>
  )
}
