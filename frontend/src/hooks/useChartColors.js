import { useColorScheme } from '@mui/material/styles'

import { tokens } from '../theme/tokens'

/**
 * Chart colors for the current light/dark mode. Charts draw SVG, which needs real
 * color values rather than the theme's CSS variables.
 */
export function useChartColors() {
  const { mode, systemMode } = useColorScheme()
  const resolved = mode === 'system' ? systemMode : mode
  return tokens[resolved === 'dark' ? 'dark' : 'light'].chart
}
