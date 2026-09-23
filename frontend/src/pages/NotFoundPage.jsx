import { Button, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

export default function NotFoundPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start', py: 4 }}>
      <Typography variant="h2" component="h1">Page not found</Typography>
      <Typography sx={{ color: 'text.secondary' }}>
        The page you're looking for doesn't exist or has moved.
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">Go to your dashboard</Button>
    </Stack>
  )
}
