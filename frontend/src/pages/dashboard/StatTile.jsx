import { Paper, Stack, Typography } from '@mui/material'

/** A headline number with its label (and an optional note underneath). */
export default function StatTile({ label, value, note }) {
  return (
    <Paper variant="outlined" role="group" aria-label={label} sx={{ p: 2.5 }}>
      <Stack spacing={0.5}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
        <Typography
          component="p"
          sx={{ fontSize: '2rem', fontWeight: 650, lineHeight: 1.1, fontVariantNumeric: 'proportional-nums' }}
        >
          {value}
        </Typography>
        {note && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{note}</Typography>}
      </Stack>
    </Paper>
  )
}
