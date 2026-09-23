/**
 * ACME Facilities design tokens: every color the app uses, for light and dark mode.
 *
 * This is the only file (with ./index.js) allowed to contain color values. Components
 * use the theme instead, e.g. sx={{ color: 'text.secondary', bgcolor: 'brand.main' }}.
 * See frontend/DESIGN.md. src/theme/no-hardcoded-colors.test.js enforces it.
 *
 * Every text/background pair below meets WCAG AA (4.5:1) contrast.
 */

// Status and priority chips: { fg: text and icon, bg: fill }.
const light = {
  brand: {
    // ACME teal: primary actions, links, active navigation, the logo
    main: '#0e6f68',
    dark: '#0a524d',
    light: '#3f8f89',
    contrastText: '#ffffff',
  },
  // The brand panel on the sign-in pages (and any future hero surface)
  brandSurface: {
    main: '#0a524d',
    contrastText: '#ffffff',
    grid: 'rgba(255, 255, 255, 0.05)',
    outline: 'rgba(255, 255, 255, 0.35)',
    highlight: 'rgba(255, 255, 255, 0.14)',
  },
  accent: { main: '#b8641a', contrastText: '#ffffff' }, // warm amber: things that need attention
  background: { default: '#f3f6f5', paper: '#ffffff', subtle: '#e9efed' },
  text: { primary: '#1b262c', secondary: '#55656c', disabled: '#94a3a8' },
  divider: '#d8e0de',
  error: { main: '#b3261e', contrastText: '#ffffff' },
  warning: { main: '#b8641a', contrastText: '#ffffff' },
  info: { main: '#1f5fa8', contrastText: '#ffffff' },
  success: { main: '#2e7d32', contrastText: '#ffffff' },
  status: {
    open: { fg: '#1f5fa8', bg: '#e3eefb' },
    in_progress: { fg: '#0a5c56', bg: '#dcefec' },
    blocked: { fg: '#a8221b', bg: '#fbe3e1' },
    resolved: { fg: '#256b29', bg: '#e1f1e2' },
    closed: { fg: '#4d5c63', bg: '#e7ecea' },
  },
  priority: {
    low: { fg: '#4d5c63', bg: '#e7ecea' },
    medium: { fg: '#1f5fa8', bg: '#e3eefb' },
    high: { fg: '#8f4a0c', bg: '#fbebd9' },
    critical: { fg: '#ffffff', bg: '#b3261e' },
  },
}

const dark = {
  brand: {
    main: '#4fc2b8',
    dark: '#2f9a91',
    light: '#7fd6ce',
    contrastText: '#0b1d1c',
  },
  brandSurface: {
    main: '#0b3f3b',
    contrastText: '#ffffff',
    grid: 'rgba(255, 255, 255, 0.04)',
    outline: 'rgba(255, 255, 255, 0.3)',
    highlight: 'rgba(255, 255, 255, 0.12)',
  },
  accent: { main: '#e39a55', contrastText: '#1f1206' },
  background: { default: '#111719', paper: '#182023', subtle: '#1f292c' },
  text: { primary: '#e4ebe9', secondary: '#9aabaf', disabled: '#5f6f73' },
  divider: '#2b373b',
  error: { main: '#ec8a82', contrastText: '#1f0d0c' },
  warning: { main: '#e39a55', contrastText: '#1f1206' },
  info: { main: '#9cc5f5', contrastText: '#0d1b2b' },
  success: { main: '#9bdca0', contrastText: '#0d1f10' },
  status: {
    open: { fg: '#9cc5f5', bg: '#1a2c40' },
    in_progress: { fg: '#7fd6ce', bg: '#143230' },
    blocked: { fg: '#f4aaa4', bg: '#3d1d1b' },
    resolved: { fg: '#9bdca0', bg: '#1a3420' },
    closed: { fg: '#b3c0c3', bg: '#263134' },
  },
  priority: {
    low: { fg: '#b3c0c3', bg: '#263134' },
    medium: { fg: '#9cc5f5', bg: '#1a2c40' },
    high: { fg: '#f3bb86', bg: '#3b2814' },
    critical: { fg: '#1f0d0c', bg: '#ec8a82' },
  },
}

export const tokens = { light, dark }

export const FONT_FAMILY = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
