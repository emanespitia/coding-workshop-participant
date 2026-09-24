import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'
import { mockApi } from './test/utils'

describe('App', () => {
  it('starts on the sign-in page when nobody is signed in', async () => {
    mockApi({})
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
