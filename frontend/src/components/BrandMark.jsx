import { Box, Stack, Typography } from '@mui/material'

/**
 * The ACME Facilities logo: a building tile plus the name.
 * `inverted` is for dark brand surfaces (the sign-in panel): a light tile with a teal building.
 */
export default function BrandMark({ inverted = false }) {
  const tile = inverted ? 'brandSurface.contrastText' : 'brand.main'
  const glyph = inverted ? 'brandSurface.main' : 'brand.contrastText'
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <Box component="svg" viewBox="0 0 32 32" aria-hidden="true" sx={{ width: 32, height: 32, flexShrink: 0 }}>
        <Box component="rect" width="32" height="32" rx="7" sx={{ fill: (t) => resolve(t, tile) }} />
        <Box component="path" d="M9 23V12l7-4 7 4v11h-5v-6h-4v6z" sx={{ fill: (t) => resolve(t, glyph) }} />
      </Box>
      <Typography component="span" sx={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
        ACME Facilities
      </Typography>
    </Stack>
  )
}

// SVG `fill` isn't one of the sx color shorthands, so look the palette path up directly.
function resolve(theme, path) {
  return path.split('.').reduce((node, key) => node[key], (theme.vars || theme).palette)
}
