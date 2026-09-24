/** Display names for the API's incident values (backend: app/core/constants.py). */

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const CATEGORY_LABELS = {
  hvac: 'Heating & cooling',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  network: 'Network & Wi-Fi',
  it_hardware: 'IT hardware',
  av_equipment: 'AV equipment',
  furniture: 'Furniture',
  cleaning: 'Cleaning',
  security: 'Security',
  access_control: 'Access control',
  other: 'Other',
}

export const AVAILABILITY_LABELS = {
  available: 'Available',
  busy: 'Busy',
  off_duty: 'Off duty',
}

export const REQUEST_STATUS_LABELS = {
  pending: 'Waiting for an admin',
  approved: 'Approved',
  rejected: 'Turned down',
  withdrawn: 'Withdrawn',
}
