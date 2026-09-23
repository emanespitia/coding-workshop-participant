import { Paper, Stack, Typography } from '@mui/material'

/** A titled panel on a dashboard, with an optional link or button on the right. */
export default function DashboardSection({ title, action, children }) {
  return (
    <Paper variant="outlined" component="section" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="h3" component="h2">{title}</Typography>
          {action}
        </Stack>
        {children}
      </Stack>
    </Paper>
  )
}
