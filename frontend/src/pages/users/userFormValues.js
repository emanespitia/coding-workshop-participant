import { EMAIL_DOMAIN, EMAIL_PATTERN } from '../../utils/validation'

export const EMPTY_USER = {
  fullName: '', email: '', role: 'employee', isActive: true, specialties: [], availability: 'available', phone: '',
}

export function userToForm(user) {
  return {
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    isActive: user.is_active,
    specialties: user.engineer_profile?.specialties ?? [],
    availability: user.engineer_profile?.availability ?? 'available',
    phone: user.engineer_profile?.phone ?? '',
  }
}

export function validateUser(values) {
  const errors = {}
  if (!values.fullName.trim()) errors.fullName = 'Enter their name'
  const email = values.email.trim().toLowerCase()
  if (!email) errors.email = 'Enter their work email'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter an email like jane.doe@acme.inc'
  else if (!email.endsWith(`@${EMAIL_DOMAIN}`)) errors.email = `Use an @${EMAIL_DOMAIN} email`
  if (values.role === 'engineer' && !values.specialties.length) errors.specialties = 'Choose at least one specialty'
  return errors
}

function profile(values) {
  return { specialties: values.specialties, availability: values.availability, phone: values.phone.trim() || null }
}

/** POST /users body. */
export function createPayload(values) {
  const body = { email: values.email.trim(), full_name: values.fullName.trim(), role: values.role }
  if (values.role === 'engineer') body.engineer_profile = profile(values)
  return body
}

/** PATCH /users/{id} body with only what changed. */
export function updatePayload(values, user) {
  const before = userToForm(user)
  const body = {}
  if (values.fullName.trim() !== before.fullName) body.full_name = values.fullName.trim()
  if (values.email.trim().toLowerCase() !== before.email) body.email = values.email.trim()
  if (values.role !== before.role) body.role = values.role
  if (values.isActive !== before.isActive) body.is_active = values.isActive
  if (values.role === 'engineer') {
    const next = profile(values)
    const changed = values.role !== before.role
      || JSON.stringify([...next.specialties].sort()) !== JSON.stringify([...before.specialties].sort())
      || next.availability !== before.availability
      || next.phone !== (before.phone || null)
    if (changed) body.engineer_profile = next
  }
  return body
}

// API field names → form field names
export const USER_API_FIELDS = {
  full_name: 'fullName',
  email: 'email',
  role: 'role',
  is_active: 'isActive',
  engineer_profile: 'specialties',
  'engineer_profile.specialties': 'specialties',
  'engineer_profile.phone': 'phone',
  'engineer_profile.availability': 'availability',
}
