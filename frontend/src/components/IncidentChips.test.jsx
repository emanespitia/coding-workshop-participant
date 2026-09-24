import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'

import { theme } from '../theme'
import { tokens } from '../theme/tokens'
import { PriorityChip, StatusChip } from './IncidentChips'

const renderThemed = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)

describe('incident chips', () => {
  it('shows readable status names', () => {
    renderThemed(<><StatusChip status="in_progress" /><StatusChip status="blocked" /></>)
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('names the priority for screen readers', () => {
    renderThemed(<PriorityChip priority="critical" />)
    expect(screen.getByLabelText('Critical priority')).toHaveTextContent('Critical')
  })

  it('has a color pair for every status and priority in both themes', () => {
    for (const mode of ['light', 'dark']) {
      for (const status of ['open', 'in_progress', 'blocked', 'resolved', 'closed']) {
        expect(tokens[mode].status[status]).toEqual({ fg: expect.any(String), bg: expect.any(String) })
      }
      for (const priority of ['low', 'medium', 'high', 'critical']) {
        expect(tokens[mode].priority[priority]).toEqual({ fg: expect.any(String), bg: expect.any(String) })
      }
    }
  })
})
