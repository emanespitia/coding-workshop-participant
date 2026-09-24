import { Box, Stack, Typography } from '@mui/material'
import CheckCircle from '@mui/icons-material/CheckCircle'
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked'
import { visuallyHidden } from '@mui/utils'

import { PASSWORD_RULES } from '../utils/validation'

/** Live checklist of the password rules, shown under a new-password field. */
export default function PasswordRules({ password }) {
  return (
    <Stack component="ul" spacing={0.5} aria-label="Password rules" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <Stack
            key={rule.label}
            component="li"
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', color: met ? 'success.main' : 'text.secondary' }}
          >
            {met ? <CheckCircle sx={{ fontSize: 16 }} /> : <RadioButtonUnchecked sx={{ fontSize: 16 }} />}
            <Typography variant="body2">
              {rule.label}
              <Box component="span" sx={visuallyHidden}>{met ? ' (done)' : ' (not yet)'}</Box>
            </Typography>
          </Stack>
        )
      })}
    </Stack>
  )
}
