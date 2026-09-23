import AddBoxOutlined from '@mui/icons-material/AddBoxOutlined'
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined'
import AssignmentIndOutlined from '@mui/icons-material/AssignmentIndOutlined'
import GroupOutlined from '@mui/icons-material/GroupOutlined'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import PlaylistAddCheckOutlined from '@mui/icons-material/PlaylistAddCheckOutlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined'

export const ROLE_LABELS = { admin: 'Facility admin', engineer: 'Engineer', employee: 'Employee' }

const DASHBOARD = {
  to: '/',
  label: 'Dashboard',
  icon: SpaceDashboardOutlined,
  description: 'Your numbers at a glance.',
}

/**
 * The links in the navigation bar for each role, in order. `description` is shown on
 * the page until the real page is built.
 */
export const NAV_ITEMS = {
  employee: [
    DASHBOARD,
    {
      to: '/incidents',
      label: 'My incidents',
      icon: ReportProblemOutlined,
      description: 'Everything you have reported, and where each one is up to.',
    },
    {
      to: '/incidents/new',
      label: 'Report an incident',
      icon: AddBoxOutlined,
      description: 'Tell the facilities team what is wrong and where.',
    },
  ],
  engineer: [
    DASHBOARD,
    {
      to: '/incidents',
      label: 'My work',
      icon: AssignmentIndOutlined,
      description: 'Incidents assigned to you.',
    },
    {
      to: '/incidents/available',
      label: 'Available',
      icon: InboxOutlined,
      description: 'Open incidents nobody has taken yet. Ask to be assigned.',
    },
    {
      to: '/requests',
      label: 'My requests',
      icon: PlaylistAddCheckOutlined,
      description: 'Incidents you asked to take, and what the admins decided.',
    },
  ],
  admin: [
    DASHBOARD,
    {
      to: '/incidents',
      label: 'Incidents',
      icon: ReportProblemOutlined,
      description: 'Every incident: assign, prioritise and move them through the workflow.',
    },
    {
      to: '/requests',
      label: 'Requests',
      icon: PlaylistAddCheckOutlined,
      description: 'Engineers asking to take incidents, waiting for your decision.',
    },
    {
      to: '/facilities',
      label: 'Facilities',
      icon: ApartmentOutlined,
      description: 'Buildings, floors and seats.',
    },
    {
      to: '/users',
      label: 'Users',
      icon: GroupOutlined,
      description: 'Accounts, roles, engineer specialties and password resets.',
    },
  ],
}

export function navItemsFor(role) {
  return NAV_ITEMS[role] ?? []
}
