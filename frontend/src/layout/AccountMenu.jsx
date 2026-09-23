import { useState } from 'react'
import {
  Avatar, Box, Chip, Divider, IconButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Typography,
} from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import CheckIcon from '@mui/icons-material/Check'
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LockResetOutlined from '@mui/icons-material/LockResetOutlined'
import PersonOutlined from '@mui/icons-material/PersonOutlined'
import Logout from '@mui/icons-material/Logout'
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined'
import { useNavigate } from 'react-router'

import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS } from './navigation'

const THEMES = [
  { mode: 'system', label: 'Match device', icon: SettingsBrightnessOutlined },
  { mode: 'light', label: 'Light', icon: LightModeOutlined },
  { mode: 'dark', label: 'Dark', icon: DarkModeOutlined },
]

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase()
}

/** The avatar button at the right of the bar: who you are, theme, password, sign out. */
export default function AccountMenu() {
  const { user, signOut } = useAuth()
  const { mode, setMode } = useColorScheme()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState(null)
  const close = () => setAnchor(null)

  return (
    <>
      <IconButton
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label={`Account menu for ${user.full_name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? 'account-menu' : undefined}
        sx={{ p: 0.5 }}
      >
        <Avatar sx={{ width: 34, height: 34, fontSize: 14, fontWeight: 600, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
          {initials(user.full_name)}
        </Avatar>
      </IconButton>

      <Menu
        id="account-menu"
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 260, mt: 1 } } }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
          <Typography sx={{ fontWeight: 600 }}>{user.full_name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, wordBreak: 'break-all' }}>
            {user.email}
          </Typography>
          <Chip size="small" label={ROLE_LABELS[user.role] ?? user.role} color="primary" variant="outlined" />
        </Box>
        <Divider />

        <MenuItem onClick={() => { close(); navigate('/account/profile') }}>
          <ListItemIcon><PersonOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>My profile</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { close(); navigate('/account/password') }}>
          <ListItemIcon><LockResetOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Change password</ListItemText>
        </MenuItem>

        <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>Theme</ListSubheader>
        {THEMES.map(({ mode: value, label, icon: Icon }) => (
          <MenuItem key={value} selected={mode === value} onClick={() => setMode(value)}>
            <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
            <ListItemText>{label}</ListItemText>
            {mode === value && <CheckIcon fontSize="small" sx={{ ml: 1, color: 'primary.main' }} />}
          </MenuItem>
        ))}
        <Divider />

        <MenuItem onClick={() => { close(); signOut() }}>
          <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}
