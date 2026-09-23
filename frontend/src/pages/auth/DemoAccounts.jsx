import { Button, Stack, Typography } from '@mui/material'

// Accounts created by the backend's local seed (backend/helpdesk/app/seed.py).
const DEMO_PASSWORD = 'Password123'
const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'morgan.facilities@acme.inc' },
  { role: 'Engineer', email: 'priya.shah@acme.inc' },
  { role: 'Employee', email: 'maria.garcia@acme.inc' },
]

/** Local development only: one click fills in a seeded demo account. */
export default function DemoAccounts({ onPick }) {
  return (
    <Stack spacing={1} sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', borderStyle: 'dashed' }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
        Demo accounts · local only
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {DEMO_ACCOUNTS.map((account) => (
          <Button
            key={account.email}
            size="small"
            variant="outlined"
            onClick={() => onPick(account.email, DEMO_PASSWORD)}
            title={account.email}
          >
            {account.role}
          </Button>
        ))}
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Password for every demo account: <strong>{DEMO_PASSWORD}</strong>
      </Typography>
    </Stack>
  )
}
