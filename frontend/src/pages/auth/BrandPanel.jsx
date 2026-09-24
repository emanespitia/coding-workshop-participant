import { Box, Stack, Typography } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

import BrandMark from '../../components/BrandMark'

const STEPS = ['Open', 'In progress', 'Resolved', 'Closed']

const POINTS = [
  'Report a problem from your phone or desk in under a minute.',
  "See who's working on it and every update along the way.",
  'Facility admins route each issue to the right engineer.',
]

/** The left-hand panel on wide screens: what the helpdesk is for. */
export default function BrandPanel() {
  return (
    <Box
      component="aside"
      sx={{
        bgcolor: 'brandSurface.main',
        color: 'brandSurface.contrastText',
        p: { md: 5, lg: 7 },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 6,
        // faint floor-plan grid
        backgroundImage: (t) => {
          const line = (t.vars || t).palette.brandSurface.grid
          return `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
        },
        backgroundSize: '32px 32px',
      }}
    >
      <BrandMark inverted />

      <Stack spacing={4} sx={{ maxWidth: 460 }}>
        <Typography variant="h1" component="p" sx={{ fontSize: { md: '2.1rem', lg: '2.5rem' }, textWrap: 'balance' }}>
          Something broken at work? Tell us once, then watch it get fixed.
        </Typography>

        <Stack
          direction="row"
          aria-label="How an incident moves"
          sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}
        >
          {STEPS.map((step, index) => (
            <Stack key={step} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box
                component="span"
                sx={{
                  px: 1.25, py: 0.5, borderRadius: 99, fontSize: 13, fontWeight: 600,
                  border: 1,
                  borderColor: 'brandSurface.outline',
                  bgcolor: index === 1 ? 'brandSurface.highlight' : 'transparent',
                }}
              >
                {step}
              </Box>
              {index < STEPS.length - 1 && <ArrowForwardIcon sx={{ fontSize: 16, opacity: 0.6 }} />}
            </Stack>
          ))}
        </Stack>

        <Stack component="ul" spacing={1.5} sx={{ m: 0, pl: 2.5, opacity: 0.9 }}>
          {POINTS.map((point) => (
            <Typography component="li" key={point} sx={{ lineHeight: 1.5 }}>
              {point}
            </Typography>
          ))}
        </Stack>
      </Stack>

      <Typography variant="body2" sx={{ opacity: 0.7 }}>
        For ACME Inc. staff · sign in with your @acme.inc account
      </Typography>
    </Box>
  )
}
