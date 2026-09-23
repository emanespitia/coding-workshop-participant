import {
  Box, Chip, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { Link as RouterLink, useNavigate } from 'react-router'

import { PriorityChip, StatusChip } from '../../components/IncidentChips'
import { CATEGORY_LABELS } from '../../constants/incidents'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import { formatLocation, timeAgo } from '../../utils/format'

function IncidentTable({ items, action }) {
  const navigate = useNavigate()
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Incidents">
        <TableHead>
          <TableRow>
            <TableCell>Incident</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Priority</TableCell>
            <TableCell>Updated</TableCell>
            {action && <TableCell><Box component="span" sx={visuallyHidden}>Actions</Box></TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((incident) => (
            <TableRow
              key={incident.id}
              hover
              onClick={() => navigate(`/incidents/${incident.id}`)}
              sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }}
            >
              <TableCell sx={{ maxWidth: 380 }}>
                <Link
                  component={RouterLink}
                  to={`/incidents/${incident.id}`}
                  underline="hover"
                  onClick={(event) => event.stopPropagation()}
                  sx={{ fontWeight: 600, color: 'text.primary' }}
                >
                  {incident.title}
                </Link>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  #{incident.id} · {CATEGORY_LABELS[incident.category] ?? incident.category}
                  {incident.is_escalated && ' · Escalated'}
                </Typography>
              </TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>{formatLocation(incident)}</TableCell>
              <TableCell><StatusChip status={incident.status} /></TableCell>
              <TableCell><PriorityChip priority={incident.priority} /></TableCell>
              <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{timeAgo(incident.updated_at)}</TableCell>
              {action && (
                <TableCell align="right" onClick={(event) => event.stopPropagation()} sx={{ whiteSpace: 'nowrap' }}>
                  {action(incident)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function IncidentCards({ items, action }) {
  return (
    <Stack component="ul" spacing={1.5} aria-label="Incidents" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {items.map((incident) => (
        <Paper
          component="li"
          variant="outlined"
          key={incident.id}
          sx={{ p: 2, position: 'relative', '&:focus-within': { borderColor: 'primary.main' } }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <StatusChip status={incident.status} />
              <PriorityChip priority={incident.priority} />
              {incident.is_escalated && <Chip size="small" label="Escalated" color="warning" variant="outlined" />}
            </Stack>
            <Link
              component={RouterLink}
              to={`/incidents/${incident.id}`}
              underline="none"
              sx={{
                fontWeight: 600,
                color: 'text.primary',
                // the whole card is the link's click area
                '&::after': { content: '""', position: 'absolute', inset: 0 },
              }}
            >
              {incident.title}
            </Link>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              #{incident.id} · {formatLocation(incident)} · updated {timeAgo(incident.updated_at)}
            </Typography>
            {action && <Box sx={{ position: 'relative', zIndex: 1 }}>{action(incident)}</Box>}
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

/**
 * A list of incidents: a table on desktop, cards on smaller screens.
 * `action(incident)` adds a control (e.g. a button) to each row or card.
 */
export default function IncidentCollection({ items, action }) {
  const { isDesktop } = useBreakpoints()
  return isDesktop ? <IncidentTable items={items} action={action} /> : <IncidentCards items={items} action={action} />
}
