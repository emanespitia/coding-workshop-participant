import { useState } from 'react'
import {
  AppBar, Box, Button, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Stack, Toolbar,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MenuIcon from '@mui/icons-material/Menu'
import { Link as RouterLink, NavLink, Outlet } from 'react-router'

import { useAuth } from '../auth/AuthContext'
import BrandMark from '../components/BrandMark'
import { useBreakpoints } from '../hooks/useBreakpoints'
import AccountMenu from './AccountMenu'
import { navItemsFor, ROLE_LABELS } from './navigation'

/** Links in the bar on wide screens. */
function DesktopNav({ items }) {
  return (
    <Stack component="nav" aria-label="Main" direction="row" spacing={0.5} sx={{ ml: 3 }}>
      {items.map((item) => (
        <Button
          key={item.to}
          component={NavLink}
          to={item.to}
          end
          sx={{
            color: 'text.secondary',
            px: 1.5,
            '&:hover': { color: 'text.primary' },
            '&.active': { color: 'primary.main', bgcolor: 'action.selected' },
          }}
        >
          {item.label}
        </Button>
      ))}
    </Stack>
  )
}

/** The slide-out menu on phones and tablets. */
function MobileNav({ items, role, open, onClose }) {
  return (
    <Drawer open={open} onClose={onClose} slotProps={{ paper: { sx: { width: 288, maxWidth: '85vw' } } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Box sx={{ color: 'primary.main' }}><BrandMark /></Box>
        <IconButton onClick={onClose} aria-label="Close menu" edge="end"><CloseIcon /></IconButton>
      </Stack>
      <Box sx={{ px: 2, pb: 1.5 }}>
        <Chip size="small" label={ROLE_LABELS[role] ?? role} color="primary" variant="outlined" />
      </Box>
      <Divider />
      <List component="nav" aria-label="Main" sx={{ px: 1 }}>
        {items.map(({ to, label, icon: Icon }) => (
          <ListItemButton
            key={to}
            component={NavLink}
            to={to}
            end
            onClick={onClose}
            sx={{
              borderRadius: 1,
              mb: 0.5,
              '&.active': { bgcolor: 'action.selected', color: 'primary.main' },
              '&.active .MuiListItemIcon-root': { color: 'primary.main' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}><Icon /></ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  )
}

/**
 * The frame around every signed-in page: a top bar with the links for the user's role
 * and their account menu. On narrow screens the links move into a slide-out menu.
 */
export default function AppLayout() {
  const { user } = useAuth()
  const { isDesktop } = useBreakpoints()
  const [menuOpen, setMenuOpen] = useState(false)
  const items = navItemsFor(user.role)

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          top: 'env(safe-area-inset-top, 0px)',
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {!isDesktop && (
            <IconButton
              edge="start"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Box
            component={RouterLink}
            to="/"
            aria-label="ACME Facilities home"
            sx={{ color: 'primary.main', textDecoration: 'none', display: 'flex' }}
          >
            <BrandMark />
          </Box>
          {isDesktop && <DesktopNav items={items} />}
          <Box sx={{ flexGrow: 1 }} />
          <AccountMenu />
        </Toolbar>
      </AppBar>

      {!isDesktop && (
        <MobileNav items={items} role={user.role} open={menuOpen} onClose={() => setMenuOpen(false)} />
      )}

      <Box component="main" sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: { xs: 3, md: 4 } }}>
        <Outlet />
      </Box>
    </Box>
  )
}
