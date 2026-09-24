import { useMediaQuery } from 'react-responsive'

/** Screen widths the layout changes at (px). Matches the MUI theme's sm / md breakpoints. */
export const BREAKPOINTS = { tablet: 600, desktop: 900 }

/** Which kind of screen we're on, via React Responsive. */
export function useBreakpoints() {
  const isMobile = useMediaQuery({ maxWidth: BREAKPOINTS.tablet - 1 })
  const isDesktop = useMediaQuery({ minWidth: BREAKPOINTS.desktop })
  return { isMobile, isTablet: !isMobile && !isDesktop, isDesktop }
}
