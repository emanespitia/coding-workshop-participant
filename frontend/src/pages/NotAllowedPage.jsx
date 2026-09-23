import { Button, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

export default function NotAllowedPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start', py: 4 }}>
      <Typography variant="h2" component="h1">You don't have access to this page</Typography>
      <Typography sx={{ color: 'text.secondary', maxWidth: '60ch' }}>
        This page is for a different role. If you think you should have access, ask a facility admin.
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">Go to your dashboard</Button>
    </Stack>
  )
}
