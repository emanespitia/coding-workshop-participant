import { Alert, Paper, Stack, Typography } from '@mui/material'

import { useAuth } from '../auth/AuthContext'

/** Dashboard stand-in until the per-role dashboards are built. */
export default function HomePage() {
  const { user } = useAuth()
  const firstName = user.full_name.split(' ')[0]

  return (
    <Stack spacing={3}>
      <Typography variant="h2" component="h1">Welcome, {firstName}</Typography>
      {user.must_change_password && (
        <Alert severity="warning">
          You need to choose a new password before using the helpdesk. That screen is coming next.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 3, borderStyle: 'dashed' }}>
        <Typography sx={{ color: 'text.secondary' }}>
          Your dashboard is coming soon. Use the menu to find your way around.
        </Typography>
      </Paper>
    </Stack>
  )
}
