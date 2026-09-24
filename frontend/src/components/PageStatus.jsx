import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material'

/** Spinner while a page's data loads. */
export function PageLoading({ label = 'Loading' }) {
  return (
    <Box role="status" aria-label={label} sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  )
}

/** A failed load, with a retry button. 404s read as "not found". */
export function PageError({ error, onRetry, notFound = 'We couldn’t find that.' }) {
  if (error?.status === 404) {
    return <Alert severity="info">{notFound}</Alert>
  }
  return (
    <Alert
      severity="error"
      action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Try again</Button>}
    >
      {error?.message || 'Something went wrong while loading this page.'}
    </Alert>
  )
}

/** An empty list or section: one sentence and an optional action. */
export function EmptyState({ title, children, action }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, borderStyle: 'dashed', textAlign: 'center' }}>
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography variant="h4" component="p">{title}</Typography>
        {children && <Typography sx={{ color: 'text.secondary', maxWidth: '52ch' }}>{children}</Typography>}
        {action}
      </Stack>
    </Paper>
  )
}
