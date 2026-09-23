import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * jsdom has no matchMedia, which React Responsive needs. This one answers
 * (min-width)/(max-width) queries from window.innerWidth; use setScreenWidth() in tests.
 */
function evaluate(query) {
  return query.split(/\s+and\s+/).every((part) => {
    const match = part.match(/\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)/)
    if (!match) return true
    const width = window.innerWidth
    return match[1] === 'min' ? width >= Number(match[2]) : width <= Number(match[2])
  })
}

window.matchMedia = (query) => ({
  media: query,
  get matches() {
    return evaluate(query)
  },
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.innerWidth = 1280
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
