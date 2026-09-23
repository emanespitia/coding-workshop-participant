import { useState } from 'react'
import {
  Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material'
import { BarChart } from '@mui/x-charts/BarChart'
import { LineChart } from '@mui/x-charts/LineChart'

import { useChartColors } from '../../hooks/useChartColors'
import { formatDate } from '../../utils/format'

const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
// Trend dates are UTC days ("2026-09-22"); show them as that calendar day everywhere.
const asDay = (iso) => new Date(`${iso}T12:00:00Z`)

/** A chart plus a "Show as table" toggle so the numbers are available without the picture. */
function WithTable({ chart, table, label }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <Stack spacing={1}>
      {asTable ? table : chart}
      <Box>
        <Button size="small" onClick={() => setAsTable((v) => !v)} aria-label={`${asTable ? 'Show chart' : 'Show as table'}: ${label}`}>
          {asTable ? 'Show chart' : 'Show as table'}
        </Button>
      </Box>
    </Stack>
  )
}

/** Incidents reported and resolved per day. */
export function TrendChart({ trend }) {
  const colors = useChartColors()
  const dates = trend.map((p) => asDay(p.date))
  const table = (
    <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
      <Table size="small" aria-label="Reported and resolved per day">
        <TableHead><TableRow><TableCell>Day</TableCell><TableCell align="right">Reported</TableCell><TableCell align="right">Resolved</TableCell></TableRow></TableHead>
        <TableBody>
          {trend.map((p) => (
            <TableRow key={p.date}>
              <TableCell>{formatDate(asDay(p.date))}</TableCell>
              <TableCell align="right">{p.reported}</TableCell>
              <TableCell align="right">{p.resolved}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
  const chart = (
    <Box role="img" aria-label="Line chart of incidents reported and resolved per day">
      <LineChart
        height={260}
        grid={{ horizontal: true }}
        margin={{ left: 0, right: 16 }}
        xAxis={[{ scaleType: 'point', data: dates, valueFormatter: (d) => dayLabel.format(d), tickMinStep: 3600 * 24 * 1000 }]}
        yAxis={[{ tickMinStep: 1, width: 32 }]}
        series={[
          { data: trend.map((p) => p.reported), label: 'Reported', color: colors.series[0], showMark: false },
          { data: trend.map((p) => p.resolved), label: 'Resolved', color: colors.series[1], showMark: false },
        ]}
        sx={{ '& .MuiChartsGrid-line': { stroke: colors.grid }, '& .MuiLineElement-root': { strokeWidth: 2 } }}
      />
    </Box>
  )
  return <WithTable chart={chart} table={table} label="incidents per day" />
}

/** Incidents per category, most common first (one series, so no legend). */
export function CategoryChart({ items, labels }) {
  const colors = useChartColors()
  if (!items.length) return <Typography sx={{ color: 'text.secondary' }}>No incidents in this period.</Typography>
  const names = items.map((c) => labels[c.key] ?? c.key)
  const table = (
    <Table size="small" aria-label="Incidents by category">
      <TableHead><TableRow><TableCell>Category</TableCell><TableCell align="right">Incidents</TableCell></TableRow></TableHead>
      <TableBody>
        {items.map((c, i) => <TableRow key={c.key}><TableCell>{names[i]}</TableCell><TableCell align="right">{c.count}</TableCell></TableRow>)}
      </TableBody>
    </Table>
  )
  const chart = (
    <Box role="img" aria-label="Bar chart of incidents by category">
      <BarChart
        layout="horizontal"
        height={Math.max(160, items.length * 34 + 40)}
        hideLegend
        grid={{ vertical: true }}
        margin={{ left: 0, right: 16 }}
        yAxis={[{ scaleType: 'band', data: names, width: 130, categoryGapRatio: 0.35 }]}
        xAxis={[{ tickMinStep: 1 }]}
        series={[{ data: items.map((c) => c.count), label: 'Incidents', color: colors.series[0] }]}
        borderRadius={4}
        sx={{ '& .MuiChartsGrid-line': { stroke: colors.grid } }}
      />
    </Box>
  )
  return <WithTable chart={chart} table={table} label="incidents by category" />
}

/** A ranked list with a proportional bar under each label (locations with the most incidents). */
export function RankedMeters({ items, emptyText }) {
  const colors = useChartColors()
  if (!items.length) return <Typography variant="body2" sx={{ color: 'text.secondary' }}>{emptyText}</Typography>
  const max = Math.max(...items.map((i) => i.count))
  return (
    <Stack component="ol" spacing={1.25} sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {items.map((item) => (
        <Stack component="li" key={item.id} spacing={0.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{item.label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{item.count}</Typography>
          </Stack>
          <Box sx={{ height: 6, borderRadius: 3, bgcolor: colors.track }} aria-hidden="true">
            <Box sx={{ height: '100%', width: `${(item.count / max) * 100}%`, borderRadius: 3, bgcolor: colors.meter }} />
          </Box>
        </Stack>
      ))}
    </Stack>
  )
}
