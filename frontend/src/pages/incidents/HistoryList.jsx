import { Box, Paper, Stack, Typography } from '@mui/material'

import { useAuth } from '../../auth/AuthContext'
import { formatDateTime, timeAgo } from '../../utils/format'
import { describeEvent } from '../../utils/incidentEvents'

/** Everything that happened to the incident, newest first. */
export default function HistoryList({ events }) {
  const { user } = useAuth()
  const newestFirst = [...events].reverse()

  return (
    <Paper variant="outlined" component="section" aria-labelledby="history-heading" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Typography id="history-heading" variant="h3" component="h2">History</Typography>
        <Stack component="ol" spacing={0} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {newestFirst.map((event, index) => (
            <Stack
              component="li"
              key={event.id}
              direction="row"
              spacing={1.5}
              sx={{ pb: index === newestFirst.length - 1 ? 0 : 2, position: 'relative' }}
            >
              {/* timeline dot and rail */}
              <Box sx={{ position: 'relative', width: 10, flexShrink: 0 }}>
                <Box sx={{ width: 10, height: 10, mt: 0.75, borderRadius: '50%', bgcolor: index === 0 ? 'primary.main' : 'divider' }} />
                {index < newestFirst.length - 1 && (
                  <Box sx={{ position: 'absolute', top: 22, bottom: -6, left: 4, width: 2, bgcolor: 'divider' }} />
                )}
              </Box>
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography variant="body2">
                  <strong>{event.actor.id === user.id ? 'You' : event.actor.full_name}</strong> {describeEvent(event)}
                </Typography>
                {event.comment && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    “{event.comment}”
                  </Typography>
                )}
                <Typography variant="caption" title={formatDateTime(event.created_at)} sx={{ color: 'text.secondary' }}>
                  {timeAgo(event.created_at)}
                </Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Paper>
  )
}
