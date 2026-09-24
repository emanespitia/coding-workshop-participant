import AddBoxOutlined from '@mui/icons-material/AddBoxOutlined'
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined'
import AssignmentIndOutlined from '@mui/icons-material/AssignmentIndOutlined'
import GroupOutlined from '@mui/icons-material/GroupOutlined'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import OutboxOutlined from '@mui/icons-material/OutboxOutlined'
import PlaylistAddCheckOutlined from '@mui/icons-material/PlaylistAddCheckOutlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined'

export const ROLE_LABELS = { admin: 'Facility admin', engineer: 'Engineer', employee: 'Employee' }

const DASHBOARD = { to: '/', label: 'Dashboard', icon: SpaceDashboardOutlined }

/** The links in the navigation bar for each role, in order. */
export const NAV_ITEMS = {
  employee: [
    DASHBOARD,
    { to: '/incidents', label: 'My incidents', icon: ReportProblemOutlined },
    { to: '/incidents/new', label: 'Report an incident', icon: AddBoxOutlined },
  ],
  engineer: [
    DASHBOARD,
    { to: '/incidents', label: 'My work', icon: AssignmentIndOutlined },
    { to: '/incidents/available', label: 'Available', icon: InboxOutlined },
    { to: '/requests', label: 'My requests', icon: PlaylistAddCheckOutlined },
    { to: '/incidents/mine', label: 'My reports', icon: OutboxOutlined },
  ],
  admin: [
    DASHBOARD,
    { to: '/incidents', label: 'Incidents', icon: ReportProblemOutlined },
    { to: '/requests', label: 'Requests', icon: PlaylistAddCheckOutlined },
    { to: '/facilities', label: 'Facilities', icon: ApartmentOutlined },
    { to: '/users', label: 'Users', icon: GroupOutlined },
    { to: '/incidents/mine', label: 'My reports', icon: OutboxOutlined },
  ],
}

export function navItemsFor(role) {
  return NAV_ITEMS[role] ?? []
}
