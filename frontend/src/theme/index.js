import { createTheme } from '@mui/material/styles'

import { FONT_FAMILY, tokens } from './tokens'

/** MUI palette for one mode, built from the tokens. */
function palette(t) {
  return {
    primary: t.brand,
    secondary: t.accent,
    error: t.error,
    warning: t.warning,
    info: t.info,
    success: t.success,
    background: { default: t.background.default, paper: t.background.paper },
    text: t.text,
    divider: t.divider,
    // App-specific colors, usable in sx: 'brand.main', 'brandSurface.main', 'surface.subtle'
    brand: t.brand,
    brandSurface: t.brandSurface,
    surface: { subtle: t.background.subtle },
    status: t.status,
    priority: t.priority,
  }
}

/**
 * The ACME Facilities theme. Light and dark follow the device setting (or the choice in
 * the account menu). Components get consistent defaults here so pages don't restyle them.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: palette(tokens.light) },
    dark: { palette: palette(tokens.dark) },
  },
  breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
  shape: { borderRadius: 8 },
  spacing: 8,
  typography: {
    fontFamily: FONT_FAMILY,
    h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 },
    h2: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25 },
    h3: { fontSize: '1.25rem', fontWeight: 650, lineHeight: 1.3 },
    h4: { fontSize: '1.0625rem', fontWeight: 650, lineHeight: 1.35 },
    body1: { fontSize: '1rem', lineHeight: 1.55 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { fontWeight: 600, letterSpacing: '0.08em', lineHeight: 1.5 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased', fontVariantNumeric: 'tabular-nums' },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { fullWidth: true } },
    MuiAlert: { styleOverrides: { root: { alignItems: 'center' } } },
    // Flat surfaces with a hairline border, never drop shadows.
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'inherit' } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiDialog: { styleOverrides: { paper: ({ theme: t }) => ({ borderRadius: t.shape.borderRadius * 1.5 }) } },
    MuiTableCell: {
      styleOverrides: {
        head: ({ theme: t }) => ({
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: (t.vars || t).palette.text.secondary,
          backgroundColor: (t.vars || t).palette.surface.subtle,
        }),
      },
    },
  },
})
