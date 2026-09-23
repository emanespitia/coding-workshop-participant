import { Box, CircularProgress } from '@mui/material'

export default function FullPageSpinner({ label = 'Loading' }) {
  return (
    <Box role="status" aria-label={label} sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  )
}
