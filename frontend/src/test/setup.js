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

// Charts measure their container; jsdom has no layout, so report a fixed size.
globalThis.ResizeObserver ??= class {
  constructor(callback) {
    this.callback = callback
  }

  observe(target) {
    this.callback([{ target, contentRect: { width: 800, height: 300 } }])
  }

  unobserve() {}

  disconnect() {}
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.innerWidth = 1280
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
