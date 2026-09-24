import { Box, Stack, Typography } from '@mui/material'

import BrandMark from '../../components/BrandMark'
import { useBreakpoints } from '../../hooks/useBreakpoints'
import BrandPanel from './BrandPanel'

/**
 * The frame for the sign-in and registration pages: the brand panel on wide screens,
 * then a heading, a short intro and the form.
 */
export default function AuthShell({ title, intro, children }) {
  const { isDesktop } = useBreakpoints()

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: isDesktop ? 'minmax(380px, 5fr) 6fr' : '1fr',
        bgcolor: 'background.default',
      }}
    >
      {isDesktop && <BrandPanel />}

      <Box component="main" sx={{ display: 'grid', placeItems: 'center', px: 2, py: { xs: 4, sm: 6 } }}>
        <Stack spacing={4} sx={{ width: '100%', maxWidth: 400 }}>
          {!isDesktop && (
            <Box sx={{ color: 'primary.main' }}>
              <BrandMark />
            </Box>
          )}

          <Stack spacing={1}>
            <Typography variant="h2" component="h1">{title}</Typography>
            <Typography sx={{ color: 'text.secondary' }}>{intro}</Typography>
          </Stack>

          {children}
        </Stack>
      </Box>
    </Box>
  )
}
