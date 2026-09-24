import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it, vi } from 'vitest'

import { theme } from '../../theme'
import TemporaryPasswordDialog from './TemporaryPasswordDialog'

function renderDialog(onClose = vi.fn()) {
  render(
    <ThemeProvider theme={theme}>
      <TemporaryPasswordDialog open title="Account created" person="Ava Stone" password="Temp-7x9Qk2" onClose={onClose} />
    </ThemeProvider>,
  )
  return onClose
}

describe('TemporaryPasswordDialog', () => {
  it('copies the password to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const onClose = renderDialog()

    expect(screen.getByText(/Give this temporary password to/)).toHaveTextContent('Ava Stone')
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('Temp-7x9Qk2')
    expect(await screen.findByRole('status')).toHaveTextContent('Copied')

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('selects the password when the clipboard is blocked', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Selected. Press Ctrl+C')
    expect(window.getSelection().toString()).toBe('Temp-7x9Qk2')
  })
})
